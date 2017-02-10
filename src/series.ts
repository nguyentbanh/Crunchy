'use strict';
import cheerio = require('cheerio');
import episode from './episode';
import fs = require('fs');
import request = require('./request');
import path = require('path');
import url = require('url');
import log  = require('./log');
const persistent = '.crpersistent';

/**
 * Streams the series to disk.
 */
export default function(config: IConfig, address: string, done: (err: Error) => void)
{
  const persistentPath = path.join(config.output || process.cwd(), persistent);

  fs.readFile(persistentPath, 'utf8', (err, contents) =>
  {
    const cache = config.cache ? {} : JSON.parse(contents || '{}');

    page(config, address, (err, page) =>
    {
      if (err)
      {
        return done(err);
      }

      let i = 0;
      (function next()
      {
        if (i >= page.episodes.length) return done(null);
        download(cache, config, address, page.episodes[i], (err, ignored) =>
        {
          if (err)
          {
            return done(err);
          }

          if ((ignored === false) || (ignored === undefined))
          {
            const newCache = JSON.stringify(cache, null, '  ');
            fs.writeFile(persistentPath, newCache, err =>
            {
              if (err) return done(err);
              i += 1;
              next();
            });
          }
          else
          {
            i += 1;
            next();
          }
        });
      })();
    });
  });
}

/**
 * Downloads the episode.
 */
function download(cache: {[address: string]: number}, config: IConfig,
                  baseAddress: string, item: ISeriesEpisode,
                  done: (err: Error, ign: boolean) => void)
{
  if (!filter(config, item))
  {
    return done(null, false);
  }

  const address = url.resolve(baseAddress, item.address);

  if (cache[address])
  {
    return done(null, false);
  }

  episode(config, address, (err, ignored) =>
  {
    if (err)
    {
      return done(err, false);
    }

    cache[address] = Date.now();
    done(null, ignored);
  });
}

/**
 * Filters the item based on the configuration.
 */
function filter(config: IConfig, item: ISeriesEpisode)
{
  // Filter on chapter.
  const episodeFilter = config.episode;

  if (episodeFilter > 0 && parseInt(item.episode, 10) <= episodeFilter) return false;
  if (episodeFilter < 0 && parseInt(item.episode, 10) >= -episodeFilter) return false;

  // Filter on volume.
  const volumeFilter = config.volume;

  if (volumeFilter > 0 && item.volume <= volumeFilter) return false;
  if (volumeFilter < 0 && item.volume >= -volumeFilter) return false;
  return true;
}

/**
 * Requests the page and scrapes the episodes and series.
 */
function page(config: IConfig, address: string, done: (err: Error, result?: ISeries) => void)
{
  request.get(config, address, (err, result) =>
  {
    if (err)
    {
      return done(err);
    }

    const $ = cheerio.load(result);
    const title = $('span[itemprop=name]').text();

    if (!title)
    {
      return done(new Error('Invalid page.(' + address + ')'));
    }

    log.info('Checking availability for ' + title);
    const episodes: ISeriesEpisode[] = [];

    $('.episode').each((i, el) =>
    {
      if ($(el).children('img[src*=coming_soon]').length)
      {
        return;
      }

      const volume = /([0-9]+)\s*$/.exec($(el).closest('ul').prev('a').text());
      const regexp = /Episode\s+((PV )?[S0-9][P0-9.]*[a-fA-F]?)\s*$/i;
      const episode = regexp.exec($(el).children('.series-title').text());
      const address = $(el).attr('href');

      if (!address || !episode)
      {
        return;
      }

      episodes.push({
        address: address,
        episode: episode[1],
        volume: volume ? parseInt(volume[0], 10) : 1
      });
    });

    done(null, {episodes: episodes.reverse(), series: title});
  });
}
