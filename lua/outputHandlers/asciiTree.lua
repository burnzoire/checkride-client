local pretty = require 'pl.pretty'
local term = require 'term'
local luassert = require 'luassert'
local isatty = io.type(io.stdout) == 'file' and term.isatty(io.stdout)

local ipairs = ipairs
local pairs = pairs
local tostring = tostring
local type = type
local string_format = string.format
local table_insert = table.insert
local table_concat = table.concat

return function(options)
  local busted = require 'busted'
  local handler = require 'busted.outputHandlers.base'()
  local cli = require 'cliargs'

  cli:set_name('ascii tree output handler')
  cli:flag('--color', 'force use of color')
  cli:flag('--plain', 'force use of no color')

  local cliArgs, err = cli:parse(options.arguments)
  if not cliArgs and err then
    io.stderr:write(string.format('%s: %s\n\n', cli.name, err))
    io.stderr:write(cli.printer.generate_help_and_usage() .. '\n')
    os.exit(1)
  end

  local colors
  local useColor = false
  if cliArgs.plain then
    colors = setmetatable({}, { __index = function() return function(s) return s end end })
    luassert:set_parameter('TableErrorHighlightColor', 'none')
  elseif cliArgs.color then
    colors = require 'term.colors'
    useColor = true
    luassert:set_parameter('TableErrorHighlightColor', 'red')
  else
    if package.config:sub(1, 1) == '\\' and not os.getenv('ANSICON') or not isatty then
      colors = setmetatable({}, { __index = function() return function(s) return s end end })
      luassert:set_parameter('TableErrorHighlightColor', 'none')
    else
      colors = require 'term.colors'
      useColor = true
      luassert:set_parameter('TableErrorHighlightColor', 'red')
    end
  end

  local forest = {}
  local fileRoots = {}
  local detailsById = {}

  local function getStatusRank(status)
    if status == 'error' then return 4 end
    if status == 'failure' then return 3 end
    if status == 'pending' then return 2 end
    return 1
  end

  local function pickWorseStatus(current, incoming)
    if not current then
      return incoming
    end

    if getStatusRank(incoming) > getStatusRank(current) then
      return incoming
    end

    return current
  end

  local function styleLine(status, line)
    if status == 'failure' or status == 'error' then
      return colors.red(line)
    end

    if status == 'pending' then
      return colors.yellow(line)
    end

    return colors.green(line)
  end

  local function styleTree(text)
    return colors.white(text)
  end

  local function styleTiming(text)
    if not useColor then
      return text
    end

    return '\27[90m' .. text .. '\27[0m'
  end

  local function styleLabel(status, text)
    if status == 'failure' or status == 'error' then
      return colors.red(text)
    end

    if status == 'pending' then
      return colors.yellow(text)
    end

    return colors.green(text)
  end

  local function getTestGlyph(status)
    if status == 'failure' or status == 'error' then
      return '✗'
    end

    if status == 'pending' then
      return '◌'
    end

    return '✓'
  end

  local function failureMessage(message)
    if type(message) == 'string' then
      return message
    end

    if message == nil then
      return 'Nil error'
    end

    return pretty.write(message)
  end

  local function getFileContext(element)
    local current = element
    while current do
      if current.descriptor == 'file' then
        return current
      end
      current = busted.parent(current)
    end
    return nil
  end

  local function getDescribePath(element)
    local names = {}
    local current = busted.parent(element)

    while current do
      if current.descriptor == 'file' then
        break
      end

      if current.name and current.name ~= '' and current.descriptor ~= 'it' then
        table_insert(names, 1, current.name)
      end

      current = busted.parent(current)
    end

    return names
  end

  local function getOrCreateFileRoot(fileContext)
    local fileKey = tostring(fileContext or '__root__')
    if fileRoots[fileKey] then
      return fileRoots[fileKey]
    end

    local root = {
      kind = 'file',
      key = fileKey,
      children = {},
      childMap = {},
      status = nil,
    }

    fileRoots[fileKey] = root
    table_insert(forest, root)
    return root
  end

  local function getOrCreateGroup(parentNode, name)
    local key = 'group:' .. tostring(name)
    if parentNode.childMap[key] then
      return parentNode.childMap[key]
    end

    local node = {
      kind = 'group',
      name = name,
      children = {},
      childMap = {},
      status = nil,
    }

    parentNode.childMap[key] = node
    table_insert(parentNode.children, node)
    return node
  end

  local function appendResult(element, status, debug)
    local fileContext = getFileContext(element)
    local root = getOrCreateFileRoot(fileContext)
    local path = getDescribePath(element)
    local parentNode = root
    local visitedGroups = {}

    for _, name in ipairs(path) do
      parentNode = getOrCreateGroup(parentNode, name)
      table_insert(visitedGroups, parentNode)
    end

    local detail = detailsById[tostring(element)] or {}
    local testNode = {
      kind = 'test',
      name = element.name or element.descriptor,
      status = status,
      durationMs = (element.duration or 0) * 1000,
      message = detail.message,
      trace = detail.trace or debug,
    }

    table_insert(parentNode.children, testNode)

    for _, groupNode in ipairs(visitedGroups) do
      groupNode.status = pickWorseStatus(groupNode.status, status)
    end

    root.status = pickWorseStatus(root.status, status)
  end

  local function attachParents(node)
    if not node.children then
      return
    end

    for _, child in ipairs(node.children) do
      child.parent = node
      attachParents(child)
    end
  end

  local function printTree(nodes, prefix)
    prefix = prefix or ''

    for index, node in ipairs(nodes) do
      local isLast = index == #nodes
      local connector = isLast and '└─' or '├─'
      local childPrefix = prefix .. (isLast and '  ' or '│ ')
      local line

      if node.kind == 'test' then
        line =
          styleTree(prefix .. connector .. ' ') ..
          styleLabel(node.status, getTestGlyph(node.status) .. ' ' .. node.name .. ' ') ..
          styleTiming(string_format('(%.2f ms)', node.durationMs))
      else
        line = styleTree(prefix .. connector .. ' ' .. node.name)
      end

      io.write(line .. '\n')

      if node.kind == 'test' and node.status ~= 'success' and node.message then
        local message = failureMessage(node.message)
        for detailLine in tostring(message):gmatch('[^\n]+') do
          io.write(styleLine(node.status, childPrefix .. detailLine) .. '\n')
        end

        if options.verbose and node.trace and node.trace.traceback then
          for traceLine in tostring(node.trace.traceback):gmatch('[^\n]+') do
            io.write(styleLine(node.status, childPrefix .. traceLine) .. '\n')
          end
        end
      end

      if node.children and #node.children > 0 then
        printTree(node.children, childPrefix)
      end
    end
  end

  local function printSummary()
    local summary = string_format(
      '%d success / %d failure / %d error / %d pending',
      handler.successesCount,
      handler.failuresCount,
      handler.errorsCount,
      handler.pendingsCount
    )

    local summaryStatus = 'success'
    if handler.errorsCount > 0 or handler.failuresCount > 0 then
      summaryStatus = 'failure'
    elseif handler.pendingsCount > 0 then
      summaryStatus = 'pending'
    end

    io.write('\n' .. styleLine(summaryStatus, summary) .. '\n')
  end

  handler.suiteReset = function()
    forest = {}
    fileRoots = {}
    detailsById = {}
    return nil, true
  end

  handler.pending = function(element, parent, message, debug)
    detailsById[tostring(element)] = {
      message = message,
      trace = debug,
    }
    return nil, true
  end

  handler.failure = function(element, parent, message, debug)
    detailsById[tostring(element)] = {
      message = message,
      trace = debug,
    }
    return nil, true
  end

  handler.error = function(element, parent, message, debug)
    if element.descriptor == 'it' then
      detailsById[tostring(element)] = {
        message = message,
        trace = debug,
      }
    end
    return nil, true
  end

  handler.testEnd = function(element, parent, status, debug)
    appendResult(element, status, debug)
    return nil, true
  end

  handler.suiteEnd = function()
    local topLevelNodes = {}

    for _, root in ipairs(forest) do
      attachParents(root)

      for _, child in ipairs(root.children) do
        table_insert(topLevelNodes, child)
      end
    end

    if #topLevelNodes > 0 then
      printTree(topLevelNodes)
    end

    printSummary()
    io.flush()
    return nil, true
  end

  busted.subscribe({ 'suite', 'reset' }, handler.suiteReset)
  busted.subscribe({ 'pending' }, handler.pending, { predicate = handler.cancelOnPending })
  busted.subscribe({ 'failure', 'it' }, handler.failure)
  busted.subscribe({ 'error', 'it' }, handler.error)
  busted.subscribe({ 'test', 'end' }, handler.testEnd, { predicate = handler.cancelOnPending })
  busted.subscribe({ 'suite', 'end' }, handler.suiteEnd)

  return handler
end
