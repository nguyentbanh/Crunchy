'use strict';
import cheerio = require('cheerio');
import episode from './episode';
// import fs = require('fs');
import fs = require('fs-extra');
import my_request = require('./my_request');
import path = require('path');
import url = require('url');
import log  = require('./log');
const persistent = '.crpersistent';

/**
 * Check if a file exist..
 */
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

/**
 * Streams the series to disk.
 */
export default function(config: IConfig, address: string, done: (err: Error) => void)
{
  const persistentPath = path.join(config.output || process.cwd(), persistent);

  /* Make a backup of the persistent file in case of */
  if (fileExist(persistentPath))
  {
    fs.copySync(persistentPath, persistentPath + '.backup');
  }

  fs.readFile(persistentPath, 'utf8', (err: Error, contents: string) =>
  {
    const cache = config.cache ? {} : JSON.parse(contents || '{}');

    page(config, address, (errP, page) =>
    {
      if (errP)
      {
        return done(errP);
      }

      let i = 0;
      (function next()
      {
        if (config.debug)
        {
          log.dumpToDebug('Episode ' + i, JSON.stringify(page.episodes[i]));
        }

        if (i >= page.episodes.length) return done(null);
        download(cache, config, address, page.episodes[i], (errD, ignored) =>
        {
          if (errD)
          {
            if (page.episodes[i].retry <= 0)
            {
              log.dispEpisode(config.filename, 'Error...', true);
              log.error(errD);
              log.error('Cannot fetch episode "s' + page.episodes[i].volume + 'e' + page.episodes[i].episode +
                            '", please rerun later');
              /* Go to the next on the list */
              i += 1;
            }
            else
            {
              log.dispEpisode(config.filename, 'Error...', true);
              if ((config.verbose) || (config.debug))
              {
                if (config.debug)
                {
                  log.dumpToDebug('series address', address);
                  log.dumpToDebug('series error', errD.stack || errD);
                  log.dumpToDebug('series data', JSON.stringify(page));
                }
                log.error(errD);
              }
              log.warn('Retrying to fetch episode "s' + page.episodes[i].volume + 'e' + page.episodes[i].episode +
                           '" - Retry ' + page.episodes[i].retry + ' / ' + config.retry);
              page.episodes[i].retry -= 1;
            }
            next();
          }
          else
          {
            if ((ignored === false) || (ignored === undefined))
            {
              const newCache = JSON.stringify(cache, null, '  ');
              fs.writeFile(persistentPath, newCache, (errW: Error) =>
              {
                if (errW)
                {
                  return done(errW);
                }

                i += 1;
                next();
              });
            }
            else
            {
              i += 1;
              next();
            }
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
 * Requests the page and scrapes the episodes and series.
 */
function page(config: IConfig, address: string, done: (err: Error, result?: ISeries) => void)
{
  if (address[0] === '@')
  {
    log.info('Trying to fetch from ' + address.substr(1));
    const episodes: ISeriesEpisode[] = [];
    episodes.push({
      address: address.substr(1),
      episode: '',
      volume: 0,
      retry: config.retry,
    });
    done(null, {episodes: episodes.reverse(), series: ''});
  }
  else
  {
    let episodeCount = 0;
    my_request.get(config, address, (err, result) => {
      if (err) {
        return done(err);
      }

      const $ = cheerio.load(result);
      const title = $('span[itemprop=name]').text();

      if (config.debug)
      {
        log.dumpToDebug('serie page', $.html());
      }

      if (!title) {
        if (config.debug)
        {
          log.dumpToDebug('inval page addr', address);
          log.dumpToDebug('inval page data', $);
        }
        return done(new Error('Invalid page.(' + address + ')'));
      }

      log.info('Checking availability for ' + title);
      const episodes: ISeriesEpisode[] = [];

      $('.episode').each((i, el) => {
        if ($(el).children('img[src*=coming_soon]').length) {
          return;
        }

        const volume = /([0-9]+)\s*$/.exec($(el).closest('ul').prev('a').text());
        const regexp = /Episode\s+((PV )?[S0-9][\-P0-9.]*[a-fA-F]?)\s*$/i;
        const episode = regexp.exec($(el).children('.series-title').text());
        const url = $(el).attr('href');

        if ((!url) || (!episode)) {
          return;
        }
        episodeCount += 1;
        episodes.push({
          address: url,
          episode: episode[1],
          volume: volume ? parseInt(volume[0], 10) : 1,
          retry: config.retry,
        });
      });
      if (episodeCount === 0)
      {
        log.warn('No episodes found for ' + title + '. Could it be a movie?');
      }
      done(null, {episodes: episodes.reverse(), series: title});
    });
  }
}
