"use strict";

/*global socket, config, ajaxify, app*/

$('document').ready(function() {
	$(window).on('action:ajaxify.end', function(err, data) {
		if (data.url.match(/^topic\//)) {
			addLabel();
			markPostAsEssenced();
		}
	});

	$(window).on('action:topic.tools.load', addHandlers);
	//$(window).on('action:post.tools.load', addPostHandlers);

	$(window).on('action:posts.loaded', markPostAsEssenced);


	function addHandlers() {
		$('.toggleEssenced').on('click', toggleEssenced);
	}

	function addLabel() {
		if (ajaxify.data.hasOwnProperty('isEssenced') && parseInt(ajaxify.data.isEssenced, 10) === 1) {
			require(['components'], function(components) {
				if (parseInt(ajaxify.data.isEssenced, 10) === 0) {
					//components.get('post/header').prepend('<span class="unanswered"><i class="fa fa-question-circle"></i> Unsolved</span>');
				} else if (parseInt(ajaxify.data.isEssenced, 10) === 1) {
					components.get('post/header').prepend('<span class="answered"><i class="fa nodebb-essence"></i> 精华帖</span>');
				}
			});
		}
	}

//标记精华帖
	function toggleEssenced() {
		var tid = ajaxify.data.tid;
		socket.emit('plugins.HollyEssence.toggleEssenced', {tid: tid}, function(err, data) {
			app.alertSuccess(data.isEssenced ? '帖子已经被标记为精华帖' : '帖子已经被取消精华帖标记');
			ajaxify.refresh();
		});
	}

	function markPostAsEssenced(err, data) {
		$('[component="post"][data-pid="' + ajaxify.data.essencedPid + '"]').addClass('isSolved');
	}
});
