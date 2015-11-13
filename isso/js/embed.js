/*
 * Copyright 2014, Martin Zimmermann <info@posativ.org>. All rights reserved.
 * Distributed under the MIT license
 */

require(["app/lib/ready", "app/config", "app/i18n", "app/api", "app/isso", "app/count", "app/dom", "app/text/css", "app/text/svg", "app/jade"], function(domready, config, i18n, api, isso, count, $, css, svg, jade) {

    "use strict";

    jade.set("conf", config);
    jade.set("i18n", i18n.translate);
    jade.set("pluralize", i18n.pluralize);
    jade.set("svg", svg);

    domready(function() {

        if (config["css"]) {
            var style = $.new("style");
            style.type = "text/css";
            style.textContent = css.inline;
            $("head").append(style);
        }

        count();

        if ($("#isso-thread") === null) {
            return console.log("abort, #isso-thread is missing");
        }

        $("#isso-thread").append($.new('h4'));

        api.fetch($("#isso-thread").getAttribute("data-isso-id"),
            config["max-comments-top"],
            config["max-comments-nested"]).then(
            function(rv) {
                if (rv.total_replies === 0) {
                    $("#isso-thread > h4").textContent = i18n.translate("no-comments");
                    return;
                }
                if (rv.locked == true) {
                  config.locked = true;
                }

                if (!config.locked) {
                  $("#isso-thread").append(new isso.Postbox(null));
                }
                $("#isso-thread").append('<div id="isso-root"></div>');

                var lastcreated = 0;

                // Get the count of comments, either directly from
                // `total_replies_in_thread`, or by counting replies to
                // each comments. The latter only works for one level of
                // nested comments.
                var count;
                if (rv.total_replies_in_thread) {
                  count = rv.total_replies_in_thread;
                } else {
                  count = rv.total_replies;
                  rv.replies.forEach(function(comment) {
                      count = count + comment.total_replies;
                  });
                }

                // Render initial payload of comments
                rv.replies.forEach(function(comment) {
                    isso.insert(comment, false);
                    if(comment.created > lastcreated) {
                        lastcreated = comment.created;
                    }
                });

                $("#isso-thread > h4").textContent = i18n.pluralize("num-comments", count);

                if(rv.hidden_replies > 0) {
                    isso.insert_loader(rv, lastcreated);
                }

                if (window.location.hash.length > 0) {
                    $(window.location.hash).scrollIntoView();
                }
                document.dispatchEvent(isso.done_rendering);
            },
            function(err) {
                console.log(err);
            }
        );
    });
});
