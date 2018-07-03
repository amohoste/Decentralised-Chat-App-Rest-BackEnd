const request = require('request-promise-native');
const _ = require('underscore');
const { sort_by_properties } = require('../helpers/sorters');
const pod = require('../helpers/datapods');
const { ContactError } = require('../errors/errors');
const { urlcompare } = require('../helpers/urlcompare')
const { URL } = require('url');

// Message list page
exports.message_list_page = function (req, res) {

    // Get all contacts
    let contacts = pod.getContactPod(req.user.datapod);

    // Get all sent messages
    let send_messages = pod.getMessagePod(req.user.datapod);

    // Get all received messages
    let rcvd_messages = pod.getMessageNotificationsPod(req.user.datapod);

    // Combine send and received messages + remove duplicate partcipants
    let messages = Promise.all([send_messages, rcvd_messages, contacts]).then(([send_messages, rcvd_messages, contacts]) => {
        let messages = send_messages.concat(rcvd_messages).sort(sort_by_properties(new Map([["creation_date", "desc"]])));
        messages = _.uniq(messages, true, a => new URL(a.reference).toString());
        messages = messages.filter(message => contacts.find(contact => urlcompare(contact.reference, message.reference)));
        return messages;
    });

    // Get all participants
    let participants = messages.then(messages => {
        return Promise.all(messages.map(message => pod.getOwnerPod(message.reference)));
    });

    // Get all contact id's corresponding with the participants
    let ids = Promise.all([contacts, messages]).then(([contacts, messages]) => {
        let cons = messages.map((message, i) => contacts.find(contact => (urlcompare(contact.reference, message.reference)))).filter(con => con != undefined);
        return cons.map(con => con._id);
    });

    // Get content of all messages
    let msgs = messages.then(messages => {
        return getAllMessages(messages);
    });

    // Render chatheads
    Promise.all([participants, ids, msgs]).then(([participants, ids, messages]) => {

        let chatheads = [];

        for (let i = 0; i < participants.length; i++) {
            let participant = participants[i];
            let id = ids[i];
            let message = messages[i];

            let dat = new Date(message.creation_date);
            let messagetext = (message.received ? (participant.givenName + ": ") : "You: ") + message.content;

            chatheads.push({
                lastmessage: messagetext,
                firstname: participant.givenName,
                lastname: participant.familyName,
                id: id,
                image: participant.image,
                time: dat.getHours() + ':' + (dat.getMinutes() < 10 ? '0' : '') + dat.getMinutes()
            })
        }

        res.render('messages/messagelist', {
            chatheads: chatheads
        });
    }).catch(err => {
        req.flash('error_msg', err.toString());
        console.error(err);
    });

}

// Chat page
exports.chat_page = function (req, res) {

    // Find corresponding contact to chat with
    let contact = pod.getContactPod(req.user.datapod).then(contactpod => {
        let contact = contactpod.find(con => con._id === req.params.id);
        if (contact) {
            return contact;
        } else {
            throw new ContactError('Contact not found');
        }
    });

    // Url receiver
    let receiver_url = contact.then(contact => {
        return contact.reference;
    });

    // Get info (ownerpod) receiver
    let receiverinfo = receiver_url.then(receiver_url => {
        return pod.getOwnerPod(receiver_url);
    });

    // Get Received messages from contact
    let rcvd_messages = Promise.all([pod.getMessageNotificationsPod(req.user.datapod), receiver_url]).then(([all_rcvd, receiver_url]) => {
        return all_rcvd.filter(message => urlcompare(message.reference, receiver_url));
    });

    // Get send messages
    let send_messages = Promise.all([pod.getMessagePod(req.user.datapod), receiver_url]).then(([all_send, receiver_url]) => {
        return all_send.filter(message => urlcompare(message.reference, receiver_url));
    });

    // Combine messages and filter on unique participant
    let messages = Promise.all([send_messages, rcvd_messages]).then(([send_messages, rcvd_messages]) => {
        return getAllMessages(send_messages.concat(rcvd_messages).sort(sort_by_properties(new Map([["creation_date", "asc"], ["_id", "asc"]]))));
    });

    Promise.all([receiverinfo, messages, contact]).then(([receiverinfo, messages, contact]) => {

        // Add correct date to each message
        messages.forEach(message => {
            let dat = new Date(message.creation_date);
            message.creation_date = dat.toDateString() + ' - ' + dat.getHours() + ':' + (dat.getMinutes() < 10 ? '0' : '') + dat.getMinutes();
        });

        // Render chat page
        res.render('messages/chat', {
            messages: messages,
            id: req.params.id,
            firstname: receiverinfo.givenName,
            lastname: receiverinfo.familyName,
            image: receiverinfo.image,
            nickname: contact.nickname
        });
    }).catch((err) => {
        if (err instanceof ContactError) {
            req.flash('error_msg', err.text);
            res.redirect('/messages/');
        } else {
            req.flash('error_msg', err.toString());
            console.error(err);
        }
    });
}

// Process send message
exports.send_message = function (req, res) {

    if (req.body.message) {

        let receiver_url = pod.getContactPod(req.user.datapod).then(contactpod => {
            return contactpod.find(con => con._id === req.params.id).reference;
        });

        // Configure the request
        let messagepod_url = pod.getMessagePodUrl(req.user.datapod);

        let message = Promise.all([receiver_url, messagepod_url]).then(([receiver_url, messagepod_url]) => {
            const options = {
                url: messagepod_url,
                method: 'PUT',
                headers: {
                    'content-type': 'application/json'
                },
                form: {
                    'content': req.body.message,
                    'reference': receiver_url
                }
            }

            return request(options);
        }).then(body => {
            res.redirect('/messages/' + req.params.id);
            return JSON.parse(body);
        }).catch((err) => {
            req.flash('error_msg', err.toString());
            console.error(err);
        });

        // Add message to notifications of receiver
        let notificationpod = receiver_url.then(receiver_url => {
            return pod.getMessageNotificationsPodUrl(receiver_url);
        });

        Promise.all([message, notificationpod]).then(([message, notificationpod]) => {

            const options = {
                url: notificationpod,
                method: 'PUT',
                headers: {
                    'content-type': 'application/json'
                },
                form: {
                    'message': message.identifier,
                    'reference': req.user.datapod
                }
            }

            request(options);
        }).catch((err) => {
            req.flash('error_msg', err.toString());
            console.error(err);
        });

    } else {
        res.redirect('/messages/' + req.params.id);
    }
}

// New chat page
exports.new_chat_page = function (req, res) {

    // Sorted list of contacts
    let contacts = pod.getContactPod(req.user.datapod).then(contacts => {
        return contacts.sort(sort_by_properties(new Map([["givenName", "asc"], ["familyName", "asc"]])));
    });

    // Sorted list of corresponding owner
    let owners = contacts.then(contacts => {
        return Promise.all(contacts.map(contact => request(contact.reference)));
    }).then(datapods => {
        return Promise.all(datapods.map(datapod => request(JSON.parse(datapod).owner)));
    }).then(owners => {
        return owners.map(owner => JSON.parse(owner));
    })

    // Render page using contacts and owners
    Promise.all([contacts, owners]).then(([contactlist, ownerlist]) => {

        let contacts = contactlist.map((contact, i) => {
            return { 'firstname': ownerlist[i].givenName, 'lastname': ownerlist[i].familyName, 'nickname': contact.nickname, 'id': contact._id }
        });

        res.render('messages/new', {
            contacts: contacts // Pass contacts to handlebars
        });

    }).catch(err => {
        req.flash('error_msg', err.toString());
        console.error(err);
    });
}

// Process new chat
exports.new_chat = function (req, res) {
    res.redirect('/messages/' + req.params.id);
}

function getAllMessages(messages) {
    // Get all message content
    return Promise.all(messages.map(message => {
        if (message.message) { // Received message
            return request(message.message).then(body => {
                let message = JSON.parse(body);
                message.received = true;
                return message;
            });
        } else { // Sent message
            message.received = false;
            return Promise.resolve(message);
        }
    }));
}