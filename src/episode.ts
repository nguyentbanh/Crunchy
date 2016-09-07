'use strict';
import cheerio = require('cheerio');
import fs = require('fs');
import mkdirp = require('mkdirp');
import request = require('./request');
import path = require('path');
import subtitle from './subtitle/index';
import video from './video/index';
import xml2js = require('xml2js');

/**
 * Streams the episode to disk.
 */
export default function(config: IConfig, address: string, done: (err: Error, ign: boolean) => void) {
  scrapePage(config, address, (err, page) => {
    if (err) return done(err, false);
    scrapePlayer(config, address, page.id, (err, player) => {
      if (err) return done(err, false);
      download(config, page, player, done);
    });
  });
}

/**
 * Completes a download and writes the message with an elapsed time.
 */
function complete(message: string, begin: number, done: (err: Error, ign: boolean) => void) {
  var timeInMs = Date.now() - begin;
  var seconds = prefix(Math.floor(timeInMs / 1000) % 60, 2);
  var minutes = prefix(Math.floor(timeInMs / 1000 / 60) % 60, 2);
  var hours = prefix(Math.floor(timeInMs / 1000 / 60 / 60), 2);
  console.log(message + ' (' + hours + ':' + minutes + ':' + seconds + ')');
  done(null, false);
}

/**
 * Downloads the subtitle and video.
 */
function download(config: IConfig, page: IEpisodePage, player: IEpisodePlayer, done: (err: Error, ign: boolean) => void) {
  var series = config.series || page.series;
  series = series.replace("/","_").replace("'","_");
  var fileName = name(config, page, series).replace("/","_").replace("'","_");
  var filePath = path.join(config.output || process.cwd(), series, fileName);
  mkdirp(path.dirname(filePath), (err: Error) => {
    if (err) return done(err, false);
    downloadSubtitle(config, player, filePath, err => {
      if (err) return done(err, false);
      var now = Date.now();
			if (player.video.file != undefined)
			{
        console.log('Fetching ' + fileName);
        downloadVideo(config, page, player, filePath, err => {
          if (err) return done(err, false);
          if (config.merge) return complete('Finished ' + fileName, now, done);
          var isSubtited = Boolean(player.subtitle);
          video.merge(config, isSubtited, player.video.file, filePath, player.video.mode, err => {
            if (err) return done(err, false);
            complete('Finished ' + fileName, now, done);
          });
        });
      }
      else
      {
        console.log('Ignoring ' + fileName + ': not released yet');
        done(null, true);
      }
    });
  });
}

/**
 * Saves the subtitles to disk.
 */
function downloadSubtitle(config: IConfig, player: IEpisodePlayer, filePath: string, done: (err?: Error) => void) {
  var enc = player.subtitle;
  if (!enc) return done();
  subtitle.decode(enc.id, enc.iv, enc.data, (err, data) => {
    if (err) return done(err);
    var formats = subtitle.formats;
    var format = formats[config.format] ? config.format : 'ass';
    formats[format](data, (err: Error, decodedSubtitle: string) => {
      if (err) return done(err);
      fs.writeFile(filePath + '.' + format, '\ufeff' + decodedSubtitle, done);
    });
  });
}

/**
 * Streams the video to disk.
 */
function downloadVideo(config: IConfig,
  page: IEpisodePage,
  player: IEpisodePlayer,
  filePath: string,
  done: (err: Error) => void) {
  video.stream(
    player.video.host,
    player.video.file,
    page.swf,
    filePath, path.extname(player.video.file),
    player.video.mode,
    done);
}

/**
 * Names the file based on the config, page, series and tag.
 */
function name(config: IConfig, page: IEpisodePage, series: string) {
	var episodeNum = parseInt(page.episode, 10);
	var volumeNum = parseInt(page.volume, 10);
  var episode = (episodeNum < 10 ? '0' : '') + page.episode;
  var volume = (volumeNum < 10 ? '0' : '') + page.volume;
  var tag = config.tag || 'CrunchyRoll';
  return series + ' ' + volume + 'x' + episode + ' [' + tag + ']';  
}

/**
 * Prefixes a value.
 */
function prefix(value: number|string, length: number) {
  var valueString = typeof value !== 'string' ? String(value) : value;
  while (valueString.length < length) valueString = '0' + valueString;
  return valueString;
}

/**
 * Requests the page data and scrapes the id, episode, series and swf.
 */
function scrapePage(config: IConfig, address: string, done: (err: Error, page?: IEpisodePage) => void) {
  var id = parseInt((address.match(/[0-9]+$/) || ['0'])[0], 10);
  if (!id) return done(new Error('Invalid address.'));
  request.get(config, address, (err, result) => {
    if (err) return done(err);
    var $ = cheerio.load(result);
    var swf = /^([^?]+)/.exec($('link[rel=video_src]').attr('href'));
    var regexp = /\s*([^\n\r\t\f]+)\n?\s*[^0-9]*([0-9][0-9.]*)?,?\n?\s\s*[^0-9]*((PV )?[S0-9][P0-9.]*[a-fA-F]?)/;
    var look = $('#showmedia_about_media').text();
    var seasonTitle = $('span[itemprop="title"]').text();
    var data = regexp.exec(look);

    if (!swf || !data)
    {
      console.info('Something wrong in the page at '+address+' (data are: '+look+')');
      console.info('Setting Season to 0 and episode to \’0\’...');
      done(null, {
          id: id,
          episode: "0",
          series: seasonTitle,
          swf: swf[1],
          volume: "0"
      });
    }
    done(null, {
      id: id,
      episode: data[3],
      series: data[1],
      swf: swf[1],
      volume: data[2] || "1"
    });
  });
}

/**
 * Requests the player data and scrapes the subtitle and video data.
 */
function scrapePlayer(config: IConfig, address: string, id: number, done: (err: Error, player?: IEpisodePlayer) => void) {
  var url = address.match(/^(https?:\/\/[^\/]+)/);
  if (!url) return done(new Error('Invalid address.'));
  request.post(config, {
    form: {current_page: address},
    url: url[1] + '/xml/?req=RpcApiVideoPlayer_GetStandardConfig&media_id=' + id
  }, (err, result) => {
    if (err) return done(err);
    xml2js.parseString(result, {
      explicitArray: false,
      explicitRoot: false
    }, (err: Error, player: IEpisodePlayerConfig) => {
      if (err) return done(err);
      try {
        var isSubtitled = Boolean(player['default:preload'].subtitle);
		var streamMode="RTMP";
		if (player['default:preload'].stream_info.host == "")
		{
			streamMode="HLS";
		}
        done(null, {
          subtitle: isSubtitled ? {
            id: parseInt(player['default:preload'].subtitle.$.id, 10),
            iv: player['default:preload'].subtitle.iv,
            data: player['default:preload'].subtitle.data
          } : null,
          video: {
            mode: streamMode,
            file: player['default:preload'].stream_info.file,
            host: player['default:preload'].stream_info.host
          }
        });
      } catch (parseError) {
        done(parseError);
      }
    });
  });
}
