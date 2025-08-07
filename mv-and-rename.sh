#!/bin/bash
mv -v ~/Downloads/pinterest_*.* .
for f in `ls pinterest_* 2>/dev/null`
  do
    mv -v $f ${f/pinterest_/}
  done
[ -f popup_js.js ] && mv -v popup_js.js popup.js
