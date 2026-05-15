-- Extend package.path so spec files can `require` helpers and stubs by short name.
-- This file is executed by Busted before any spec runs (via the `helper` key in .busted).
package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

-- Absolute-or-relative root of the repository (relative to where `busted` is invoked).
CHECKRIDE_REPO_ROOT = "./"
