const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require('../config/keys');

const client = redis.createClient(keys.redisUrl);
client.hget = util.promisify(client.hget);

const exec = mongoose.Query.prototype.exec; // refering to mongoose exec

mongoose.Query.prototype.cache = function(options={}) {
	this.useCache = true;
	this.hashkey = JSON.stringify(options.key || '');
	return this; //to make this call chainable
}

mongoose.Query.prototype.exec = async function() {
	if(!this.useCache) {
		return exec.apply(this, arguments);
	}
	const key = JSON.stringify(Object.assign({},this.getQuery(),{
		collection: this.mongooseCollection.name
	}));
	//See if we've value for 'key' in redis
	const cacheValue = await client.hget(this.hashkey, key);
	//If we do,return that
	if(cacheValue) {
		const doc = JSON.parse(cacheValue);
		console.log('CacheHit');
		console.log(cacheValue);
		return Array.isArray(doc) ? doc.map(d => new this.model(d)) : new this.model(doc);
	}
	//Otherwise issue the query and store the result in redis
	const result = await exec.apply(this, arguments);
	client.hset(this.hashkey, key, JSON.stringify(result), 'EX', 10);
	return result;
}

module.exports = {
	clearHash(hashkey) {
		client.del(JSON.stringify(hashkey));
	}
};