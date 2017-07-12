const async = require('async');
const Ig = require('./ig');
const ig = new Ig();
const Database = require('./database').Database;
const database = new Database();
const Scraper = require('./scraper');
const store = require('../client/store');
const FileHandler = require('./file-controller.js');
const fileHandler = new FileHandler();
const currentSession = { initialized: false, session: {} };

ig.initialize()
  .then(result => {
    console.log('initializing session');
    currentSession.session = result;
  });

function spliceDuplicates(users) {
  return users.filter((user, index, collection) => {
    return collection.indexOf(user) == index;
  })
}

function Prospect() {

}

// const dispatchClient = data => {
//   fetch('/dispatch', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(data)
//   })
// }

Prospect.prototype.likers = function (params, filterParams) { // can be broken into 5 functions
  const { username, days, mediaLimit } = params;
  console.log('likers:', username, days, mediaLimit);
  const lookback = days > 0 ? days : 30;
  
  var arrLikers = [];
  const publicLikerIds = [];
  var publicLikerNames = [];
  var counter = 0;
  // initializing
  store.dispatch({
    type: 'GLOBAL_DISPATCH',
    dispatch: {
      type: 'CHANGE_STAGE',
      stage: 'medias'
    }
  });
  // dispatchClient({
  //   type: 'CHANGE_STAGE',
  //   stage: 'medias'
  // })
  scrapeSave(username, true)
    .then(scraped => {
      // start medias gathering
      console.log('trying to dispatch');
      // store.dispatch({
      //   type: 'CHANGE_STAGE',
      //   stage: 'medias'
      // });
      console.log(scraped);
      ig.getMedias(scraped.external_id, currentSession.session, lookback)
        .then(medias => {
          console.log('medias count:', medias.length);
          let mediaCounter = 0;
          // store.dispatch({
          //   type: 'UPDATE_STATUS',
          //   status: {
          //     progress: 0,
          //     total: medias.length
          //   }
          // });
          // store.dispatch({
          //   type: 'CHANGE_STAGE',
          //   stage: 'likers'
          // });
          async.mapSeries(medias, (media, next) => {
            mediaCounter++;
            // gathering likers for mediaCounter of medias.length posts
            // store.dispatch({
            //   type: 'UPDATE_STATUS',
            //   status: {
            //     progress: mediaCounter
            //   }
            // });
            ig.getLikers(media, currentSession.session)
              .then(likers => {
                arrLikers = arrLikers.concat(...likers);
                setTimeout(() => {
                  next();
                }, 1000)
              })
              .catch(err => {
                setTimeout(() => {
                  next();
                })
              })
          }, err => {
            console.log('likers count:', arrLikers.length);

            var likerNames = arrLikers.map(liker => { return liker.username; });
            var dedupedLikers = spliceDuplicates(likerNames);
            console.log('after dedupe:', dedupedLikers.length);

            var publicLikers = arrLikers.filter(liker => { return liker.isPrivate == false; });
            publicLikerNames = publicLikers.map(liker => { return liker.username; });
            const dedupedPublicLikers = spliceDuplicates(publicLikerNames); // this will be useful for monitoring progress
            console.log('deduped public only:', dedupedPublicLikers.length);
            // store.dispatch({
            //   type: 'UPDATE_STATUS',
            //   status: {
            //     progress: 0,
            //     total: dedupedPublicLikers.length
            //   }
            // });
            // store.dispatch({
            //   type: 'CHANGE_STAGE',
            //   stage: 'users'
            // });
            async.mapSeries(dedupedPublicLikers, (liker, followup) => {
              counter++;
              console.log((counter / dedupedPublicLikers.length * 100).toFixed(2));
              // store.dispatch({
              //   type: 'UPDATE_STATUS',
              //   status: {
              //     progress: counter
              //   }
              // });
              scrapeSave(liker)
                .then(user => {
                  publicLikerIds.push(user.id);
                  followup();
                })
                .catch(err => { // light-weight error handling. not very effective. read up on try/catch and implement further upstream
                  console.log('error detected, trying again...');
                  console.error(err);
                  scrapeSave(liker)
                    .then(likerIds => {
                      console.log('second attempt successful');
                      publicLikerIds.push(likerIds.id);
                      followup();
                    })
                    .catch(err => {
                      console.log('second error, continuing');
                      followup();
                    })
                })
            }, err => {
              // filtering users for influencers
              // store.dispatch({
              //   type: 'CHANGE_STAGE',
              //   stage: 'filter'
              // });
              database.getInfluencers(publicLikerIds, filterParams)
                .then(influencers => {
                  const headers = ['id', 'externalId', 'username', 'postCount', 'followerCount', 'followingCount', 'following/follower ratio', 'recentPostCount', 'recentAvLikes', 'recentAvComments', 'engagementRatio', 'postFrequency(Hr)', 'likesCount', 'website'];
                  var influencerData = influencers.map(influencer => { // refactor this mess
                    return influencer.id +',' + influencer.external_id + ',' + influencer.username + ',' + influencer.post_count + ',' + influencer.follower_count + ',' + 
                    influencer.following_count + ',' + (influencer.following_count / influencer.follower_count) + ',' + influencer.recent_post_count + ',' + (influencer.recent_like_count / influencer.recent_post_count) + ',' +
                    (influencer.recent_comment_count / influencer.recent_post_count) + ',' + ((influencer.recent_like_count + influencer.recent_comment_count) / influencer.recent_post_count) / influencer.follower_count + ',' + ((influencer.recent_post_duration / 3600) / influencer.recent_post_count) + ',' +
                    publicLikerNames.filter(likerName => { return likerName == influencer.username; }).length + ',' + influencer.external_url + ',"' + influencer.bio + '"';
                  });
                  // writing to file
                  store.dispatch({
                    type: 'CHANGE_STAGE',
                    stage: 'write'
                  });
                  fileHandler.writeToCSV(influencerData, username + '-influencer-data', headers)
                    .then(result => {
                      // database.getConsumers(publicLikerIds)
                      //   .then(consumers => {
                      //     var consumerData = consumers.map(consumer => {
                      //       return consumer.id +',' + consumer.external_id + ',' + consumer.username + ',' + consumer.follower_count + ',' + 
                      //       consumer.following_count + ',' + (consumer.following_count / consumer.follower_count) + ',' + 
                      //       consumer.recent_post_count + ',' + consumer.recent_like_count + ',' + consumer.recent_comment_count + ',' + ((consumer.recent_post_duration / 3600) / consumer.recent_post_count) + ',' +
                      //       publicLikerNames.filter(likerName => { return likerName == consumer.username; }).length + ',' + consumer.external_url;
                      //     })
                      //     fileHandler.writeToCSV(consumerData, username + '-consumer-data', headers);
                      //   })
                      // complete!!
                    })
                })
                .catch(err => {
                  console.log('getInfluencers failure');
                  console.error(err);
                })
            });
          })
        });
    })
    .catch(err => {
      console.error(err);
    });
}
const scrapeSave = (username, bypass=false) => { // now with more resume-ability!
  console.log('scraping', username);
  var thisId;
  return new Promise((resolve, reject) => {
    database.getUserByUsername(username)
      .then(user => {
        // console.log('user:', user);
        if (!user || bypass || user.recent_like_count == 0 || user.recent_like_count == null) {
          Scraper(username)
            .then(user => {
              database.upsertUser(user)
                .then(result => {
                  database.getEIdFromExternalId(user.external_id, 'users')
                    .then(id => {
                      resolve({ id: id[0].id, external_id: user.external_id });
                    })
                })
                .catch(err => {
                  console.log('upsert attemp failure');
                  reject(err);
                })
            })
            .catch(err => {
              console.log('scraper failure');
              reject(err);
            })
        } else {
          console.log('skipping');
          resolve({ id: user.id, external_id: user.external_id });
        }
      })
    .catch(err => {
      console.log('get user by username failure');
      reject(err);
    })
  });
}
module.exports = Prospect