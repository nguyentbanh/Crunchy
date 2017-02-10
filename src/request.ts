'use strict';
import request = require('request');
import cheerio = require('cheerio');
import log = require('./log');
const cloudscraper = require('cloudscraper');

let isAuthenticated = false;
let isPremium = false;

const defaultHeaders: request.Headers =
{
  'User-Agent': 'Mozilla/5.0 (Windows NT 6.2; WOW64; rv:34.0) Gecko/20100101 Firefox/34.0',
  'Connection': 'keep-alive'
};

/**
 * Performs a GET request for the resource.
 */
export function get(config: IConfig, options: request.Options, done: (err: Error, result?: string) => void)
{
  authenticate(config, err =>
  {
    if (err)
    {
        return done(err);
    }

    cloudscraper.request(modify(options, 'GET'), (err: Error, response: any, body: any) =>
    {
      if (err)
      {
          return done(err);
      }

      done(null, typeof body === 'string' ? body : String(body));
    });
  });
}

/**
 * Performs a POST request for the resource.
 */
export function post(config: IConfig, options: request.Options, done: (err: Error, result?: string) => void)
{
  authenticate(config, err =>
  {
    if (err)
    {
        return done(err);
    }

    cloudscraper.request(modify(options, 'POST'), (err: Error, response: any, body: any) =>
    {
      if (err)
      {
          return done(err);
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
  if (isAuthenticated || !config.pass || !config.user)
  {
      return done(null);
  }

  /* Bypass the login page and send a login request directly */
  let options =
  {
    headers: defaultHeaders,
    jar: true,
    gzip: false,
    method: 'GET',
    url: 'https://www.crunchyroll.com/login'
  };

  cloudscraper.request(options, (err: Error, rep: string, body: string) =>
  {
    if (err) return done(err);

    const $ = cheerio.load(body);

    /* Get the token from the login page */
    const token = $('input[name="login_form[_token]"]').attr('value');
    if (token === '')
    {
        return done(new Error('Can`t find token!'));
    }

    let options =
    {
      headers: defaultHeaders,
      form:
      {
        'login_form[redirect_url]': '/',
        'login_form[name]': config.user,
        'login_form[password]': config.pass,
        'login_form[_token]': token
      },
      jar: true,
      gzip: false,
      method: 'POST',
      url: 'https://www.crunchyroll.com/login'
    };

    cloudscraper.request(options, (err: Error, rep: string, body: string) =>
    {
      if (err)
      {
          return done(err);
      }

      /* The page return with a meta based redirection, as we wan't to check that everything is fine, reload
       * the main page. A bit convoluted, but more sure.
       */
      let options =
      {
        headers: defaultHeaders,
        jar: true,
        url: 'http://www.crunchyroll.com/',
        method: 'GET'
      };

      cloudscraper.request(options, (err: Error, rep: string, body: string) =>
      {
        if (err)
        {
            return done(err);
        }

        let $ = cheerio.load(body);

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
          return done(new Error('Authentication failed: ' + error));
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
  });
}

/**
 * Modifies the options to use the authenticated cookie jar.
 */
function modify(options: string|request.Options, reqMethod: string): request.Options
{
  if (typeof options !== 'string')
  {
    options.jar = true;
    options.headers = defaultHeaders;
    options.method = reqMethod;
    return options;
  }
  return { jar: true, headers: defaultHeaders, url: options.toString(), method: reqMethod };
}
