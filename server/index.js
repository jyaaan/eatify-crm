const path = require('path');
const watchify = require('watchify');
const express = require('express');
const bodyParser = require('body-parser');
const IG = require('./ig');
const Database = require('./database').Database;
const database = new Database();
const ParseScrape = require('./parse-scrape');
const Scraper = require('./scraper');
const async = require('async');

const publicPath = path.join(__dirname, '/public');
const staticMiddleware = express.static(publicPath);
const ig = new IG();
const app = express();
const currentSession = { initialized: false, session: {} };

app.use(staticMiddleware);
app.use(bodyParser.json());

ig.initialize()
  .then(result => {
    console.log('initializing session');
    currentSession.session = result;
  });


app.post('/get-following', (req, res) => {
  ig.getFollowing(req.body.id, currentSession.session)
    .then(following => {
      console.log('following:', following);
      res.send('okay dokay');
    })
});

app.post('/get-suggested', (req, res) => {

});

app.post('/lookup', (req, res) => {
  database.usernameExists(req.body.username)
    .then(result => {
      if (result) {
        database.getUserByUsername(req.body.username)
          .then(user => {
            res.json(user);
          })
      } else {
        scrapeSave(req.body.username)
          .then(scrape => {
            database.getUserByEId(scrape.id)
              .then(user => {
                res.json(user);
              })
          })
      }
    })
});

const scrapeSave = username => {
  var thisId;
  return new Promise((resolve, reject) => {
    Scraper(username)
      .then(user => {
        database.upsertUser(user)
          .then(result => {
            database.getEIdFromExternalId(user.external_id, 'users')
              .then(id => {
                resolve({ id: id[0].id, external_id: user.external_id });
              })
          })
      })
      .catch(err => {
        reject(err);
      })
  });
}

// update this to work with tasks if you decide to use them
const queueFollowing = (following, primaryUserId) => {
  
  console.log('queueFollowing activating!');
  const timeNow = new Date(Date.now()).toISOString();

  return new Promise((resolve, reject) => {
    async.mapSeries(following, (follow, next) => {
      database.getUserByUsername(follow.username)
        .then(result => {
          if (result) {
            console.log('old user, upserting relationship primary:', primaryUserId);
            database.upsertRelationship(result.id, primaryUserId, true)
              .then(related => {
                next();
              });
          } else {
            console.log('new user, inserting');
            const profile = { //add task to here
              username: follow.username,
              picture_url: follow.picture,
              full_name: follow.fullName,
              external_id: follow.id,
              private: follow.isPrivate
            };
            database.upsertUser(profile)
              .then(newUser => {
                console.log('newUser[0]', newUser[0]);
                console.log('primary id:', primaryUserId);
                database.upsertRelationship(newUser[0], primaryUserId, true)
                  .then(related => {
                    next();
                  })
              })
          }
        })
    }, (err, dat) => {
      if (!err) {
        resolve('complete');
      } else {
        reject(err);
      }
    })
  })
}

const PORT = 5760;

app.listen(PORT, () => {
  console.log('listening on port:', PORT);
})