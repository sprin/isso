/* Isso – Ich schrei sonst!
 */
define(["app/dom", "app/utils", "app/config", "app/api", "app/jade", "app/i18n", "app/lib", "app/globals"],
    function($, utils, config, api, jade, i18n, lib, globals) {

    "use strict";

    var done_rendering = new CustomEvent("done-rendering");

    var Postbox = function(parent) {

        var localStorage = utils.localStorageImpl,
            el = $.htmlify(jade.render("postbox", {
            "author":  JSON.parse(localStorage.getItem("author")),
            "email":   JSON.parse(localStorage.getItem("email")),
            "website": JSON.parse(localStorage.getItem("website"))
        }));

        // callback on success (e.g. to toggle the reply button)
        el.onsuccess = function() {};

        el.validate = function() {
            if (utils.text($(".textarea", this).innerHTML).length < 3 ||
                $(".textarea", this).classList.contains("placeholder"))
            {
                $(".textarea", this).focus();
                return false;
            }
            if (config["require-email"] &&
                $("[name='email']", this).value.length <= 0)
            {
              $("[name='email']", this).focus();
              return false;
            }
            return true;
        };

        // email is not optional if this config parameter is set
        if (config["require-email"])
        {
          $("[name='email']", el).placeholder =
            $("[name='email']", el).placeholder.replace(/ \(.*\)/, "");
        }

        // submit form, initialize optional fields with `null` and reset form.
        // If replied to a comment, remove form completely.
        $("[type=submit]", el).on("click", function() {
            if (! el.validate()) {
                return;
            }

            var author = $("[name=author]", el).value || null,
                email = $("[name=email]", el).value || null,
                website = $("[name=website]", el).value || null;

            localStorage.setItem("author", JSON.stringify(author));
            localStorage.setItem("email", JSON.stringify(email));
            localStorage.setItem("website", JSON.stringify(website));

            api.create($("#isso-thread").getAttribute("data-isso-id"), {
                author: author, email: email, website: website,
                text: utils.text($(".textarea", el).innerHTML),
                parent: parent || null
            }).then(function(comment) {
                $(".textarea", el).innerHTML = "";
                $(".textarea", el).blur();
                insert(comment, true);
                document.dispatchEvent(done_rendering);

                if (parent !== null) {
                    el.onsuccess();
                }
            });
        });

        lib.editorify($(".textarea", el));

        return el;
    };

    var insert_loader = function(comment, lastcreated) {
        var entrypoint;
        if (comment.id === null) {
            entrypoint = $("#isso-root");
            comment.name = 'null';
        } else {
            entrypoint = $("#isso-" + comment.id + " > .text-wrapper > .isso-follow-up");
            comment.name = comment.id;
        }
        var el = $.htmlify(jade.render("comment-loader", {"comment": comment}));

        entrypoint.append(el);

        $("a.load_hidden", el).on("click", function() {
            el.remove();
            api.fetch($("#isso-thread").getAttribute("data-isso-id"),
                config["reveal-on-click"], config["max-comments-nested"],
                comment.id,
                lastcreated).then(
                function(rv) {
                    if (rv.total_replies === 0) {
                        return;
                    }

                    var lastcreated = 0;
                    rv.replies.forEach(function(commentObject) {
                        insert(commentObject, false);
                        if(commentObject.created > lastcreated) {
                            lastcreated = commentObject.created;
                        }
                    });

                    if(rv.hidden_replies > 0) {
                        insert_loader(rv, lastcreated);
                    }
                    document.dispatchEvent(done_rendering);
                },
                function(err) {
                    console.log(err);
                });
        });
    };

    var insert_continue_thread = function(comment) {
        var entrypoint = $("#isso-" + comment.id + " > .text-wrapper > .isso-follow-up");
        comment.name = comment.id;
        var el = $.htmlify(jade.render("continue-thread", {"comment": comment}));

        entrypoint.append(el);

        $("a.continue-thread", el).on("click", function() {
            el.remove();
            api.fetch($("#isso-thread").getAttribute("data-isso-id"),
                config["reveal-on-click"], config["max-comments-nested"],
                comment.id).then(
                function(rv) {
                    if (rv.total_replies === 0) {
                        return;
                    }

                    var lastcreated = 0;
                    rv.replies.forEach(function(commentObject) {
                        insert(commentObject, false);
                        if(commentObject.created > lastcreated) {
                            lastcreated = commentObject.created;
                        }
                    });

                    if(rv.hidden_replies > 0) {
                        insert_loader(rv, lastcreated);
                    }
                    document.dispatchEvent(done_rendering);
                },
                function(err) {
                    console.log(err);
                });
        });
    };

    var insert = function(comment, scrollIntoView) {
        var el = $.htmlify(jade.render("comment", {"comment": comment}));

        el.get_level = function() {
          var node = this.parentNode,
              level = 0;
          while (node != null) {
            if (node.classList && node.classList.contains('isso-comment')) {
              level++;
            }
            node = node.parentNode;
          }
          return level;
        };

        // update datetime every 60 seconds
        var refresh = function() {
            $(".permalink > time", el).textContent = utils.ago(
                globals.offset.localTime(), new Date(parseInt(comment.created, 10) * 1000));
            setTimeout(refresh, 60*1000);
        };

        // run once to activate
        refresh();

        if (config["avatar"]) {
            $("div.avatar > svg", el).replace(lib.identicons.generate(comment.hash, 4, 48));
        }

        var entrypoint;
        if (comment.parent === null) {
            entrypoint = $("#isso-root");
        } else {
            entrypoint = $("#isso-" + comment.parent + " > .text-wrapper > .isso-follow-up");
        }

        entrypoint.append(el);

        if (scrollIntoView) {
            el.scrollIntoView();
        }

        var footer = $("#isso-" + comment.id + " > .text-wrapper > .isso-comment-footer"),
            header = $("#isso-" + comment.id + " > .text-wrapper > .isso-comment-header"),
            text   = $("#isso-" + comment.id + " > .text-wrapper > .text");

        var form = null;  // XXX: probably a good place for a closure

        if (config["nesting-level"] >= 1) {
          $("a.reply", footer).toggle("click",
              function(toggler) {
                  // Check if this new reply will result in a nesting level over
                  // the limit, and if so, associate the reply with the parent of
                  // the comment being replied to.
                  if (config["nesting-level"] !== "inf"
                      && el.get_level() >= config["nesting-level"]) {
                    form = footer.insertAfter(new Postbox(comment.parent));
                  }
                  else {
                    form = footer.insertAfter(new Postbox(comment.id));
                  }
                  form.onsuccess = function() { toggler.next(); };
                  $(".textarea", form).focus();
                  $("a.reply", footer).textContent = i18n.translate("comment-close");
              },
              function() {
                  form.remove();
                  $("a.reply", footer).textContent = i18n.translate("comment-reply");
              }
          );
        };

        if (config.vote) {
            // update vote counter, but hide if votes sum to 0
            var votes = function (value) {
                var span = $("span.votes", footer);
                if (span === null) {
                    if (value !== 0) {
                        footer.prepend($.new("span.votes", value));
                    }
                } else {
                    if (value === 0) {
                        span.remove();
                    } else {
                        span.textContent = value;
                    }
                }
            };

            $("a.upvote", footer).on("click", function () {
                api.like(comment.id).then(function (rv) {
                    votes(rv.likes - rv.dislikes);
                });
            });

            $("a.downvote", footer).on("click", function () {
                api.dislike(comment.id).then(function (rv) {
                    votes(rv.likes - rv.dislikes);
                });
            });
        }

        if (!config.locked) {
          $("a.reply", footer).toggle("click",
              function(toggler) {
                  form = footer.insertAfter(new Postbox(comment.parent === null ? comment.id : comment.parent));
                  form.onsuccess = function() { toggler.next(); };
                  $(".textarea", form).focus();
                  $("a.reply", footer).textContent = i18n.translate("comment-close");
              },
              function() {
                  form.remove();
                  $("a.reply", footer).textContent = i18n.translate("comment-reply");
              }
          );

          $("a.edit", footer).toggle("click",
              function(toggler) {
                  var edit = $("a.edit", footer);
                  var avatar = config["avatar"] ? $(".avatar", el, false)[0] : null;

                  edit.textContent = i18n.translate("comment-save");
                  edit.insertAfter($.new("a.cancel", i18n.translate("comment-cancel"))).on("click", function() {
                      toggler.canceled = true;
                      toggler.next();
                  });

                  toggler.canceled = false;
                  api.view(comment.id, 1).then(function(rv) {
                      var textarea = lib.editorify($.new("div.textarea"));

                      textarea.innerHTML = utils.detext(rv.text);
                      textarea.focus();

                      text.classList.remove("text");
                      text.classList.add("textarea-wrapper");

                      text.textContent = "";
                      text.append(textarea);
                  });

                  if (avatar !== null) {
                      avatar.hide();
                  }
              },
              function(toggler) {
                  var textarea = $(".textarea", text);
                  var avatar = config["avatar"] ? $(".avatar", el, false)[0] : null;

                  if (! toggler.canceled && textarea !== null) {
                      if (utils.text(textarea.innerHTML).length < 3) {
                          textarea.focus();
                          toggler.wait();
                          return;
                      } else {
                          api.modify(comment.id, {"text": utils.text(textarea.innerHTML)}).then(function(rv) {
                              text.innerHTML = rv.text;
                              comment.text = rv.text;
                          });
                      }
                  } else {
                      text.innerHTML = comment.text;
                  }

                  text.classList.remove("textarea-wrapper");
                  text.classList.add("text");

                  if (avatar !== null) {
                      avatar.show();
                  }

                  $("a.cancel", footer).remove();
                  $("a.edit", footer).textContent = i18n.translate("comment-edit");
              }
          );

          $("a.delete", footer).toggle("click",
              function(toggler) {
                  var del = $("a.delete", footer);
                  var state = ! toggler.state;

                  del.textContent = i18n.translate("comment-confirm");
                  del.on("mouseout", function() {
                      del.textContent = i18n.translate("comment-delete");
                      toggler.state = state;
                      del.onmouseout = null;
                  });
              },
              function() {
                  var del = $("a.delete", footer);
                  api.remove(comment.id).then(function(rv) {
                      if (rv) {
                          el.remove();
                      } else {
                          $("span.note", header).textContent = i18n.translate("comment-deleted");
                          text.innerHTML = "<p>&nbsp;</p>";
                          $("a.edit", footer).remove();
                          $("a.delete", footer).remove();
                      }
                      del.textContent = i18n.translate("comment-delete");
                  });
              }
          );
        }

        // remove edit and delete buttons when cookie is gone
        var clear = function(button) {
            if (! utils.cookie("isso-" + comment.id)) {
                if ($(button, footer) !== null) {
                    $(button, footer).remove();
                }
            } else {
                setTimeout(function() { clear(button); }, 15*1000);
            }
        };

        clear("a.edit");
        clear("a.delete");

        // show direct reply to own comment when cookie is max aged
        var show = function(el) {
            if (utils.cookie("isso-" + comment.id)) {
                setTimeout(function() { show(el); }, 15*1000);
            } else {
                footer.append(el);
            }
        };

        if (config["nesting-level"] >= 1 && config["reply-to-self"] && utils.cookie("isso-" + comment.id)) {
            show($("a.reply", footer).detach());
        }

        if(comment.hasOwnProperty('replies')) {
            var lastcreated = 0;
            comment.replies.forEach(function(replyObject) {
                insert(replyObject, false);
                if(replyObject.created > lastcreated) {
                    lastcreated = replyObject.created;
                }

            });
            if(comment.hidden_replies > 0) {
                insert_loader(comment, lastcreated);
            }
        }
        if(comment.deeper_replies > 0) {
            insert_continue_thread(comment);
        }
        document.dispatchEvent(done_rendering);

    };

    return {
        done_rendering: done_rendering,
        insert: insert,
        insert_loader: insert_loader,
        insert_continue_thread: insert_continue_thread,
        Postbox: Postbox
    };
});
