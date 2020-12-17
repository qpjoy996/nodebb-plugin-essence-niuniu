"use strict";

var plugin = {},
	// async = require.main.require('async'),
	topics = require.main.require('./src/topics'),
	posts = require.main.require('./src/posts'),
	categories = require.main.require('./src/categories'),
	meta = require.main.require('./src/meta'),
	privileges = require.main.require('./src/privileges'),
	rewards = require.main.require('./src/rewards'),
	user = require.main.require('./src/user'),
	helpers = require.main.require('./src/controllers/helpers'),
	db = require.main.require('./src/database'),
	plugins = require.main.require('./src/plugins'),
	SocketPlugins = require.main.require('./src/socket.io/plugins');

plugin.init = async function(params) {
	// console.log('Avatar info', `essence init`);
	var app = params.router,
		middleware = params.middleware;

	app.get('/essence', middleware.buildHeader, renderEssenced);
	app.get('/api/essence', renderEssenced);

	handleSocketIO();

	plugin._settings = await meta.settings.get('essence');
};

plugin.appendConfig = async function(config) {
	// console.log('Avatar info', `essence appendConfig`);
	config['essence'] = plugin._settings;
	return config;
};

plugin.addNavigation = async function(menu) {
	console.log('Avatar info', `essence addNavigation`);
	menu = menu.concat(
			{
				"route": "/essence",
				"title": "精华帖",
				"iconClass": "nodebb-essence",
				"text": "精华帖"
			}
	);
	return menu;
};

plugin.getTopics = async function(hookData) {
	// console.log('Avatar info', `essence getTopics`);

	hookData.topics.forEach((topic) => {
		if (topic && parseInt(topic.isEssenced, 10)) {			
			// topic.essence ='<span class="answered" style="padding:0;border:none;"><i class="fa nodebb-essence" style="vertical-align:middle;"></i> </span> ';
			// topic.essence ='<span class="answered"><i class="fa nodebb-essence"></i> 精华帖</span> ';
			topic.essence ='<span class="e-answered">精华帖</span> ';
		}else {
			topic.essence ='';
			//普通帖
			// topic.titleSolver = '<span class="unanswered"><i class="fa fa-question-circle"></i> [[qanda:topic_unsolved]]</span> ';
		}
	});
	return hookData;
};

plugin.addThreadTool = async function(data) {
	// console.log('Avatar info', `essence addThreadTool`);
	//是否为精华帖
	var isEssenced = parseInt(data.topic.isEssenced, 10);
	//是管理员 版主才可以加精
	if(!isEssenced){
		data.tools.push({//非精华帖管理员可以加精
			class: 'toggleEssenced alert-warning',
			title: '标记为精华帖',
			icon: 'nodebb-essence'
		});
	}else{//是精华帖 管理员可以取消加精  toggleQuestionStatus
		data.tools.push({
			class: 'toggleEssenced alert-warning',
			title: '取消精华帖标记',
			icon: 'nodebb-essence'
		});
	}

	return data;
	//判断是不是合法管理人员 ，只有管理人员或版主才可以给帖子加精华帖标示
	// privileges.topics.isAdminOrMod(data.tid,socket.uid,function(err,canAddEssence){
	// 	if(canAddEssence){
	//
	// 	}
	//
	// });
};

// plugin.addPostTool = function(postData, callback) {
// 	topics.getTopicDataByPid(postData.pid, function(err, data) {
// 		data.isEssenced = parseInt(data.isEssenced, 10) === 1;
// 		data.isQuestion = parseInt(data.isQuestion, 10) === 1;
//
// 		if (data.uid && !data.isEssenced && data.isQuestion && parseInt(data.mainPid, 10) !== parseInt(postData.pid, 10)) {
// 			postData.tools.push({
// 				"action": "HollyEssence/post-solved",
// 				"html": "Mark this post as the correct answer",
// 				"icon": "fa-check-circle"
// 			});
// 		}
//
// 		callback(false, postData);
// 	});
// };

plugin.getConditions = async function(conditions) {
	console.log('Avatar info', `essence getConditions`);
	conditions.push({
		"name": "Times questions accepted",
		"condition": "HollyEssence/essence.accepted"
	});
	return conditions;
};

function handleSocketIO() {
	// console.log('Avatar info', `essence handleSocketIO`);
	SocketPlugins.HollyEssence = {};
  // 标记是否为精华帖
	SocketPlugins.HollyEssence.toggleEssenced = async function(socket, data) {
		//判断是不是合法管理人员 ，只有管理人员或版主才可以给帖子加精华帖标示
		const canEdit = await privileges.topics.canEdit(data.tid, socket.uid);
		if (!canEdit) {
			throw new Error('[[error:no-privileges]]');
		}

		return await toggleEssenced(socket.uid, data.tid, data.pid);

		// privileges.topics.isAdminOrMod(data.tid,socket.uid,function(err,canAddEssence){
		// 	if(!canAddEssence){
		// 		return callback(new Error('[[error:no-privileges]]'));
		// 	}

		// 		if (data.pid) {
		// 			toggleEssenced(data.tid, data.pid, callback);
		// 		} else {
		// 			toggleEssenced(data.tid, callback);
		// 		}
		// });
	};

}
//帖子加精 和取消精华帖标示
async function toggleEssenced(uid, tid, pid) {
	console.log('Avatar info', `essence toggleEssenced`);

	let isEssenced = await topics.getTopicField(tid, 'isEssenced');
	isEssenced = parseInt(isEssenced, 10) === 1;
	if(isEssenced) {
		await topics.setTopicFields(tid, {isEssenced: 0, essencedPid: 0});
		await db.sortedSetRemove('topics:essenced', Date.now(), tid);
		// await db.sortedSetRemove('topics:')
	}else {
		await topics.setTopicFields(tid, {isEssenced: 1, essencedPid: pid});
		await db.sortedSetAdd('topics:essenced', Date.now(), tid);

		if(pid) {
			const data = await posts.getPostData(pid);
			await rewards.checkConditionAndRewardUser({
				uid: data.uid,
				condition: 'HollyEssence/essence.accepted',
				method: async function() {
					await user.incrementUserFieldBy(data.uid, 'HollyEssence/essence.accepted', 1);
				}
			})
		}
	}
	plugins.fireHook('action:topic.toggleEssenced', { uid: uid, tid: tid, pid: pid, isEssenced: !isEssenced });
	return { isEssenced: !isEssenced };
}

async function renderEssenced(req, res) {
	const page = parseInt(req.query.page, 10) || 1;

	const [settings, allTids, canPost] = await Promise.all([
		user.getSettings(req.uid),
		db.getSortedSetRevRange('topics:essenced', 0, 199),
		canPostTopic(req.uid),
	]);
	let tids = await privileges.topics.filterTids('read', allTids, req.uid);

	const start = Math.max(0, (page - 1) * settings.topicsPerPage);
	const stop = start + settings.topicsPerPage - 1;

	const topicCount = tids.length;
	const pageCount = Math.max(1, Math.ceil(topicCount / settings.topicsPerPage));
	tids = tids.slice(start, stop + 1);

	const topicsData = await topics.getTopicsByTids(tids, req.uid);

	const data = {};
	data.topics = topicsData;
	data.nextStart = stop + 1;
	data.set = 'topics:essenced';
	data['feeds:disableRSS'] = true;
	data.pagination = pagination.create(page, pageCount);
	data.canPost = canPost;
	data.title = '精华帖';

	data.breadcrumbs = helpers.buildBreadcrumbs([{ text: '精华帖' }]);

	res.render('recent', data);
}


// async function renderEssenced(req, res, next) {
// 	console.log('Avatar info', `essence renderEssenced`);
// 	var stop = (parseInt(meta.config.topicsPerList, 10) || 20) - 1;
// 	console.log(`[Avatar info]: rendering essence`, req, res, stop, helpers);
// 	topics.getTopicsFromSet('topics:essenced', req.uid, 0, stop, function(err, data) {
// 		if (err) {
// 			return next(err);
// 		}

// 		data['feeds:disableRSS'] = true;
// 		data.breadcrumbs = helpers.buildBreadcrumbs([{text: '精华帖'}]);
// 		res.render('recent', data);
// 	});
// }

module.exports = plugin;
