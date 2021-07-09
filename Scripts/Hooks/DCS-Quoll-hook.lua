local status, result = pcall(function() local dcsSr=require('lfs');dofile(dcsSr.writedir()..[[Mods\Services\DCS-Quoll\Scripts\DCS-QuollGameGUI.lua]]); end,nil) 
 
if not status then
    net.log(result)
end