'use strict';
import os = require('os');
import fs = require('fs-extra');
import path = require('path');

const configFile = path.join(process.cwd(), 'config.json');

function fileExist(path: string)
{
  try
  {
    fs.statSync(path);
    return true;
  } catch (e)
  {
    return false;
  }
}

export function load(): IConfigLine
{
  if (fileExist(configFile))
  {
    const data = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(data);
  }

  return {args: undefined};
}

export function save(config: IConfig)
{
  const tmp = JSON.parse(JSON.stringify(config));

  // Things added by the command line parser
  tmp.rawArgs = undefined;
  tmp.options = undefined;
  tmp._execs = undefined;
  tmp._args = undefined;
  tmp._name = undefined;
  tmp._version = undefined;
  tmp._versionOptionName = undefined;
  tmp._events = undefined;
  tmp._eventsCount = undefined;
  tmp.args = undefined;
  tmp.commands = undefined;
  tmp._allowUnknownOption = undefined;

  // Things we don't want to save
  tmp.cache = undefined;
  tmp.episodes = undefined;
  tmp.series = undefined;
  tmp.video_format = undefined;
  tmp.video_quality = undefined;
  tmp.rebuildcrp = undefined;
  tmp.batch = undefined;
  tmp.verbose = undefined;
  tmp.debug = undefined;
  tmp.unlog = undefined;

  fs.writeFileSync(configFile, JSON.stringify(tmp, null, '  '));
}