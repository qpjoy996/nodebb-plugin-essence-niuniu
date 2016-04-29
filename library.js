"use strict";

var plugin = {},
	async = module.parent.require('async'),
	topics = module.parent.require('./topics'),
	posts = module.parent.require('./posts'),
	categories = module.parent.require('./categories'),
	meta = module.parent.require('./meta'),
	privileges = module.parent.require('./privileges'),
	rewards = module.parent.require('./rewards'),
	user = module.parent.require('./user'),
	helpers = module.parent.require('./controllers/helpers'),
	db = module.parent.require('./database'),
	SocketPlugins = module.parent.require('./socket.io/plugins');

plugin.init = function(params, callback) {
	var app = params.router,
		middleware = params.middleware,
		controllers = params.controllers;

	app.get('/essence', middleware.buildHeader, renderEssenced);
	app.get('/api/essence', renderEssenced);

	handleSocketIO();

	callback();
};

plugin.appendConfig = function(config, callback) {
	meta.settings.get('essence', function(err, settings) {
		config['essence'] = settings;
		callback(null, config);
	});
};

plugin.addNavigation = function(menu, callback) {
	menu = menu.push(
			{
				"route": "/essence",
				"title": "精华帖",
				"iconClass": "nodebb-essence",
				"text": "精华帖"
			}
	);

	callback (null, menu);
};

plugin.getTopics = function(data, callback) {
	var topics = data.topics;

	async.map(topics, function(topic, next) {
		if(parseInt(topic.isEssenced, 10)){
			//精华帖样式
			topic.title ='<span class="answered"><i class="fa nodebb-essence"></i> 精华帖</span> ' + topic.title;
		}else{
			//普通帖
			//topic.title = '<span class="unanswered"><i class="fa nodebb-essence"></i> Unsolved</span> ' + topic.title;
		}

		return next(null, topic);
	}, function(err, topics) {
		return callback(err, data);
	});
};

plugin.addThreadTool = function(data, callback) {
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

	callback(false, data);
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

plugin.getConditions = function(conditions, callback) {
	conditions.push({
		"name": "Times questions accepted",
		"condition": "HollyEssence/essence.accepted"
	});

	callback(false, conditions);
};

function handleSocketIO() {
	SocketPlugins.HollyEssence = {};
  // 标记是否为精华帖
	SocketPlugins.HollyEssence.toggleEssenced = function(socket, data, callback) {
		//判断是不是合法管理人员 ，只有管理人员或版主才可以给帖子加精华帖标示
		privileges.topics.isAdminOrMod(data.tid,socket.uid,function(err,canAddEssence){
			if(!canAddEssence){
				return callback(new Error('[[error:no-privileges]]'));
			}

				if (data.pid) {
					toggleEssenced(data.tid, data.pid, callback);
				} else {
					toggleEssenced(data.tid, callback);
				}
		});
	};

}
//帖子加精 和取消精华帖标示
function toggleEssenced(tid, pid, callback) {
	if (!callback) {
		callback = pid;
		pid = false;
	}//isEssenced

	topics.getTopicField(tid, 'isEssenced', function(err, isEssenced) {
		isEssenced = parseInt(isEssenced, 10) === 1;

		async.parallel([
			function(next) {
				topics.setTopicField(tid, 'isEssenced', isEssenced ? 0 : 1, next);
			},
			function(next) {
				if (!isEssenced && pid) {
					topics.setTopicField(tid, 'essencedPid', pid, next);
				} else {
					topics.deleteTopicField(tid, 'essencedPid', next);
				}
			},
			function(next) {
				if (!isEssenced && pid) { //原未加精  现在toggle 加精
					posts.getPostData(pid, function(err, data) {
						//检查奖励条件 奖励发精华帖的用户
						//TODO 待修改 验证确认
						rewards.checkConditionAndRewardUser(data.uid, 'HollyEssence/essence.accepted', function(callback) {
							user.incrementUserFieldBy(data.uid, 'HollyEssence/essence.accepted', 1, callback);
						});

						next();
					});
				} else {
					next();
				}
			},
			function(next) {
				if (!isEssenced) { //原未加精  现在toggle 加精
					db.sortedSetAdd('topics:essenced', Date.now(), tid, next);
				} else {
					db.sortedSetRemove('topics:essenced', tid, next);
				}
			}
		], function(err) {
			callback(err, {isEssenced: !isEssenced});
		});
	});
}

function renderEssenced(req, res, next) {
	var stop = (parseInt(meta.config.topicsPerList, 10) || 20) - 1;
	topics.getTopicsFromSet('topics:essenced', req.uid, 0, stop, function(err, data) {
		if (err) {
			return next(err);
		}

		data['feeds:disableRSS'] = true;
		data.breadcrumbs = helpers.buildBreadcrumbs([{text: '精华帖'}]);
		res.render('recent', data);
	});
}

module.exports = plugin;
