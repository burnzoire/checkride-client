-- Extend package.path so spec files can `require` helpers and stubs by short name.
-- This file is executed by Busted before any spec runs (via the `helper` key in .busted).
package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

if _G.loadstring == nil and _G.load ~= nil then
	_G.loadstring = _G.load
end

-- Absolute-or-relative root of the repository (relative to where `busted` is invoked).
CHECKRIDE_REPO_ROOT = "./"
