'use strict';
import cheerio = require('cheerio');
import request = require('request');
import rp = require('request-promise');
import Promise = require('bluebird');
import uuid = require('uuid');
import path = require('path');
import fs = require('fs-extra');
import log = require('./log');

import { RequestPromise } from 'request-promise';
import { Response } from 'request';

// tslint:disable-next-line:no-var-requires
const cookieStore = require('tough-cookie-file-store');
// tslint:disable-next-line:no-var-requires
const cloudscraper = require('cloudscraper');

let isAuthenticated = false;
let isPremium = false;

let j: request.CookieJar;

const defaultHeaders: request.Headers =
{
  'User-Agent': 'Mozilla/5.0 (Windows NT 6.2; WOW64; x64; rv:58.0) Gecko/20100101 Firefox/58.0',
  'Connection': 'keep-alive',
  'Referer': 'https://www.crunchyroll.com/login',
};

function startSession(config: IConfig): Promise<string>
{
  if (config.crDeviceId === undefined)
  { 
    config.crDeviceId = uuid.v4();
  }

  return rp(
  {
    method: 'GET',
    url: config.crSessionUrl,
    qs:
    {
      device_id: config.crDeviceId,
      device_type: config.crDeviceType,
      access_token: config.crSessionKey,
      version: config.crAPIVersion,
      locale: config.crLocale,
    },
    json: true,
  })
  .then((response: any) =>
  {
    return response.data.session_id;
  });
}

function login(config: IConfig, sessionId: string, user: string, pass: string): Promise<any>
{
  return rp(
  {
    method: 'POST',
    url:  config.crLoginUrl,
    form:
    {
      account: user,
      password: pass,
      session_id: sessionId,
      version: config.crAPIVersion,
    },
    json: true,
    jar: j,
  })
  .then((response) =>
  {
    if (response.error) throw new Error('Login failed: ' + response.message);
    return response.data;
  });
}

function loadCookies(config: IConfig)
{
  const cookiePath = path.join(config.output || process.cwd(), '.cookies.json');
  if(!fs.existsSync(cookiePath))
  {
      fs.closeSync(fs.openSync(cookiePath, 'w'));
  }
  j = request.jar(new cookieStore(cookiePath));
}

export function eatCookies(config: IConfig)
{
  const cookiePath = path.join(config.output || process.cwd(), '.cookies.json');

  if(fs.existsSync(cookiePath))
  {
      fs.removeSync(cookiePath);
  }
  j = undefined;
}

/**
 * Performs a GET request for the resource.
 */
export function get(config: IConfig, options: string|request.Options, done: (err: any, result?: string) => void)
{
  if (j === undefined)
  {
    loadCookies(config);
  }

  authenticate(config, (err) =>
  {
    if (err)
    {
      return done(err);
    }

    cloudscraper.request(modify(options, 'GET'), (error: any, response: any, body: any) =>
    {
      if (error) return done(error);
      done(null, typeof body === 'string' ? body : String(body));
    });
  });
}

/**
 * Performs a POST request for the resource.
 */
export function post(config: IConfig, options: request.Options, done: (err: Error, result?: string) => void)
{
  if (j === undefined)
  {
    loadCookies(config);
  }

  authenticate(config, (err) =>
  {
    if (err)
    {
        return done(err);
    }

    cloudscraper.request(modify(options, 'POST'), (error: Error, response: any, body: any) =>
    {
      if (error)
      {
         return done(error);
      }
      done(null, typeof body === 'string' ? body : String(body));
    });
  });
}

/**
 * Authenticates using the configured pass and user.
 */
function authenticate(config: IConfig, done: (err: Error) => void)
{
  if (isAuthenticated)
  {
    return done(null);
  }

  if (!config.pass || !config.user)
  {
    log.error('You need to give login/password to use Crunchy');
    process.exit(-1);
  }

  startSession(config)
  .then((sessionId: string) =>
  {
    defaultHeaders.Cookie = `sess_id=${sessionId}; c_locale=enUS`;
    return login(config, sessionId, config.user, config.pass);
  })
  .then((userData) =>
  {
    /**
     * The page return with a meta based redirection, as we wan't to check that everything is fine, reload
     * the main page. A bit convoluted, but more sure.
     */
    const options =
    {
      headers: defaultHeaders,
      jar: j,
      url: 'http://www.crunchyroll.com/',
      method: 'GET',
    };

    cloudscraper.request(options, (err: Error, rep: string, body: string) =>
    {
      if (err)
      {
         return done(err);
      }

      const $ = cheerio.load(body);

      /* Check if auth worked */
      const regexps = /ga\('set', 'dimension[5-8]', '([^']*)'\);/g;
      const dims = regexps.exec($('script').text());

      for (let i = 1; i < 5; i++)
      {
        if ((dims[i] !== undefined) && (dims[i] !== '') && (dims[i] !== 'not-registered'))
        {
            isAuthenticated = true;
        }

        if ((dims[i] === 'premium') || (dims[i] === 'premiumplus'))
        {
            isPremium = true;
        }
      }

      if (isAuthenticated === false)
      {
        const error = $('ul.message, li.error').text();
        log.error('Authentication failed: ' + error);
        process.exit(-1);
      }

      if (isPremium === false)
      {
          log.warn('Do not use this app without a premium account.');
      }
      else
      {
        log.info('You have a premium account! Good!');
      }
      done(null);
    });
  });
}

/**
 * Modifies the options to use the authenticated cookie jar.
 */
function modify(options: string|request.Options, reqMethod: string): request.Options
{
  if (typeof options !== 'string')
  {
    options.jar = j;
    options.headers = defaultHeaders;
    options.method = reqMethod;
    return options;
  }
  return {
    jar: j,
    headers: defaultHeaders,
    url: options.toString(),
    method: reqMethod
  };
}
