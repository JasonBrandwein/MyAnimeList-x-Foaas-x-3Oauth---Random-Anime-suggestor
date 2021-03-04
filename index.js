const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const querystring = require("querystring");
let amountdone = 0;
let offornot = true;

const { client_id, client_secret, scope } = require("./auth/credentials.json");
const port = 3000;

const all_sessions = [];
const code_verifier = crypto.randomBytes(60).toString("hex");
const server = http.createServer();

let cachedimg = new Map();

server.on("listening", listen_handler);
server.listen(port);
function listen_handler() {
  console.log(`Now Listening on Port ${port}`);
}
server.on("request", request_handler);
function request_handler(req, res) {
  console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);

  if (req.url === "/") {
    amountdone = 0;
    const form = fs.createReadStream("html/index.html");
    res.writeHead(200, { "Content-Type": "text/html" });
    form.pipe(res);
  } else if (req.url.startsWith("/create_my_anime_list")) {
    console.log("req.url is", req.url);
    let user_input = url.parse(req.url, true).query;
    if (user_input === null) {
      not_found(res);
    }
    console.log("user amount is ", user_input.amount);
    //fixes the user input incase it's not set to any value for resliancy.
    if (user_input.amount === "") {
      user_input.amount = 1;
    }
    if (user_input.amount > 200) {
      user_input.amount = 200;
    }
    if (user_input.amount < 1) {
      user_input.amount = 1;
    }

    console.log(user_input);
    const { season, year, amount } = user_input;

    if (user_input.offornot === `true`) {
      offornot = true;
      console.log("\n\n\n OFFORNOT = TRUE NNN");
    } else {
      console.log("\n\n\n OFFORNOT = false NNN");

      offornot = false;
    }
    const state = "OAuth 2.0 state";
    const response_type = "code";
    all_sessions.push({ season, year, amount, state, response_type });
    redirect_to_myanimelist(response_type, state, res);
  } else if (req.url.startsWith("/recieve_code")) {
    amountdone = 0;
    const { code, state } = url.parse(req.url, true).query;
    let session = all_sessions.find((session) => session.state === state);
    const { season, year, amount } = session;
    if (
      code === undefined ||
      state === undefined ||
      year === undefined /*|| session === undefined*/
    ) {
      console.log("one of them isn't found");
      console.log(session);
      not_found(res);
      return;
    }
    const grant_type = "authorization_code";
    send_access_token_request(
      code,
      { season, year, amount },
      state,
      client_id,
      grant_type,
      code_verifier,
      res
    );
  } else if (req.url.startsWith("/search?")) {
    console.log("searching");
  } else {
    not_found(res);
  }
}

function redirect_to_myanimelist(response_type, state, res) {
  const authorization_endpoint = "https://myanimelist.net/v1/oauth2/authorize";
  let code_challenge = code_verifier;
  let uri = querystring.stringify({
    client_id,
    code_challenge,
    response_type,
    state,
  });
  res.writeHead(302, { Location: `${authorization_endpoint}?${uri}` }).end();
}

function not_found(res) {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.end(`<h1>404 Not Found</h1>`);
}

function send_access_token_request(
  code,
  user_input,
  state,
  client_id,
  grant_type,
  code_verifier,
  res
) {
  const token_endpoint = "https://myanimelist.net/v1/oauth2/token";
  //need client id, secret, grand type - set to auth code, code - what we just recieved , and code_Verifier. <- the crypto
  //const post_data = querystring.stringify({client_id, client_secret, code, grant_type, code_verifier});
  const post_data = querystring.stringify({
    client_id,
    client_secret,
    code,
    grant_type,
    code_verifier,
  });
  let options = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  https
    .request(token_endpoint, options, (token_stream) =>
      process_stream(token_stream, receive_access_token, user_input, res)
    )
    .end(post_data);
}

function get_my_anime_list(user_input, access_token, res) {
  const { season, year, amount } = user_input;
  console.log("The year is ", { year });
  console.log("user input is ", user_input);
  let offset = Math.floor(Math.random() * 200);
  console.log("offset = ", offset);
  const options = {
    hostname: `api.myanimelist.net`,
    path: `/v2/anime/season/${year}/${season}?limit=${amount}&offset=${offset}`,
    method: "GET",
    port: "443",
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  };
  https
    .request(options, (token_stream) =>
      process_stream(
        token_stream,
        recieve_anime,
        user_input,
        { access_token },
        res
      )
    )
    .end();
}

function recieve_anime(body, user_input, access_token, res) {
  const anime = JSON.parse(body);
  create_anime(anime, user_input, access_token, res);
}

function create_anime(anime, user_input, access_token, res) {
  console.log(anime);
  let length = anime.data.length;
  console.log("length is", length);
  console.log("WE HAVE THIS MANY ANIMES TO PRINT ", anime.data.length);
  res.writeHead(200, { "Content-Type": "text/html" });

  get_foaas_for_anime_v2(anime.data, res);
}
function get_foaas_for_anime_v2(data, res) {
  if (!data || data.length === 0) {
    console.log("all done");
    all_sessions.pop();
    amountdone = 0;
    res.end();
  } else {
    get_foaas_for_anime(data.pop(), data, res, get_foaas_for_anime_v2);
  }
}

function get_foaas_for_anime(anime_name, rest_of_data, res, callback) {
  console.log("getting anime ", ++amountdone);
  if (offornot === true) {
    console.log("going to offensive");
    offensiveRandFoaas(anime_name, rest_of_data, res, callback);
  } else {
    console.log("going to clean");
    cleanRandFoaas(anime_name, rest_of_data, res, callback);
  }
}

function offensiveRandFoaas(animeData, rest_of_data, res, callback) {
  console.log(animeData.node);
  let name = animeData.node.title;
  if (name.includes("/")) {
    //has a non acceptable character we must remove it.
    name = name.replace("/", "%2F");
  }

  let url = `https://foaas.com/`;
  let from = `myanimelist`;
  let randarr = [
    `asshole/${name}`,
    `awesome/${name}`,
    `because/${name}`,
    `cool/${name}`, //clean
    `diabetes/${name}`, //clean
    `holygrail/${name}`, //clean
    `madison/${name}/${from}`, //clean
    `dalton/${name}/${from}`,
    `dosomething/${name}/something/${from}`,
    `fascinating/${name}`,
    `back/${name}/${from}`,
    `bag/${name}`,
    `ballmer/${name}/SUBBERS/${from}`,
    `greed/Anime/${from}`,
  ];
  url = url + randarr[Math.floor(Math.random() * randarr.length)];
  https.request(url, { method: "GET" }, getFoaas).end();
  function getFoaas(jobs_stream) {
    let foaasData = "";
    jobs_stream.on("data", (chunk) => (foaasData += chunk));
    jobs_stream.on("end", () =>
      printfoaas(animeData, foaasData, res, callback, rest_of_data)
    );
  }
}

function cleanRandFoaas(animeData, rest_of_data, res, callback) {
  let name = animeData.node.title;

  if (name.includes("/")) {
    //has a non acceptable character we must remove it.
    name = name.replace("/", "%2F");
  }

  let url = `https://foaas.com/`;
  let from = `myanimelist`;
  let cleanrandarr = [
    `cool/${name}`, //clean
    `diabetes/${name}`, //clean
    `holygrail/${name}`, //clean
    `madison/${name}/${from}`,
  ]; //clean];

  url = url + cleanrandarr[Math.floor(Math.random() * cleanrandarr.length)];
  https.request(url, { method: "GET" }, getFoaas).end();
  function getFoaas(jobs_stream) {
    let foaasData = "";
    jobs_stream.on("data", (chunk) => (foaasData += chunk));
    jobs_stream.on("end", () =>
      printfoaas(animeData, foaasData, res, callback, rest_of_data)
    );
  }
}

function cachecheck(imgid, imglink) {

  if (cachedimg.has(imgid)) {
    if (cachedimg.get(imgid) != imglink) {
      //if they're different we use the old link of the old image. Hopefully it's still hosted on the myanimewebsite.
      imglink = cachedimg.get(imgid);
    }
  } else {
    //we store the image and cache it.
    cachedimg.set(imgid, imglink);
  }

  return imglink;
}
function printfoaas(anime_data, foaasData, res, callback, rest_of_data) {
  res.write(`<div> <center>`);
  res.write(`<h1>${anime_data.node.title} </h1>`);

  //checks if the image was cached.
  anime_data.node.main_picture.large = cachecheck(
    anime_data.node.id,
    anime_data.node.main_picture.large
  );

  res.write(`<img src = ${anime_data.node.main_picture.large} > </center>`);
  res.write(foaasData);
  res.write(`<\div>`);
  callback(rest_of_data, res);
}

function endcheck(res, length) {
  // console.log("endcheck started");
  // console.log("length = ", length);
  // console.log("amount done is ", amountdone);
  if (length === amountdone) {
    all_sessions.pop();
    res.end();
  }
}

function process_stream(stream, callback, ...args) {
  let body = "";
  stream.on("data", (chunk) => (body += chunk));
  stream.on("end", () => callback(body, ...args));
}

function receive_access_token(body, user_input, res) {
  const { access_token } = JSON.parse(body);

  // console.log("access_token is" , access_token);
  get_my_anime_list(user_input, access_token, res);
}

function receive_task_response(body, res) {
  const results = JSON.parse(body);
  console.log(results);
  res.writeHead(302, { Location: `${results.url}` }).end();
}
