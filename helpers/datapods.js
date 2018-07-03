const request = require('request-promise-native');

// Get datapod content
exports.getDatapod = function (datapod) {
    return request(datapod).then(body => {
        return JSON.parse(body);
    })
}

// Get owner pod url
exports.getOwnerPodUrl = function (datapod) {
    return module.exports.getDatapod(datapod).then(datapod => {
        return datapod.owner;
    });
}

// Get owner pod content
exports.getOwnerPod = function (datapod) {
    return module.exports.getOwnerPodUrl(datapod).then(url => {
        return request(url);
    }).then(body => {
        return JSON.parse(body);
    });
}

// Get contact pod url
exports.getContactPodUrl = function (datapod) {
    return module.exports.getDatapod(datapod).then(datapod => {
        return datapod.contacts;
    });
}

// Get contact pod content
exports.getContactPod = function (datapod) {
    return module.exports.getContactPodUrl(datapod).then(url => {
        return request(url);
    }).then(body => {
        return JSON.parse(body);
    });
}

// Get message pod url
exports.getMessagePodUrl = function (datapod) {
    return module.exports.getDatapod(datapod).then(datapod => {
        return datapod.messages;
    });
}

// Get message pod content
exports.getMessagePod = function (datapod) {
    return module.exports.getMessagePodUrl(datapod).then(url => {
        return request(url);
    }).then(body => {
        return JSON.parse(body);
    });
}

// Get notification pod url
exports.getNotificationPodUrl = function (datapod) {
    return module.exports.getDatapod(datapod).then(datapod => {
        return datapod.notifications;
    });
}

// Get notification pod content
exports.getNotificationPod = function (datapod) {
    return module.exports.getNotificationPodUrl(datapod).then(url => {
        return request(url);
    }).then(body => {
        return JSON.parse(body);
    });
}

// Get message notification pod url
exports.getMessageNotificationsPodUrl = function (datapod) {
    return module.exports.getDatapod(datapod).then(datapod => {
        return request(datapod.notifications);
    }).then(body => {
        return JSON.parse(body).message_notifications;
    });
}

// Get message notification pod content
exports.getMessageNotificationsPod = function (datapod) {
    return module.exports.getMessageNotificationsPodUrl(datapod).then(url => {
        return request(url);
    }).then(body => {
        return JSON.parse(body);
    });
}

// Checks if url points to a valid datapods
exports.checkIfDatapod = function(url) {
    return request(url).then(body => {
        let datapod = JSON.parse(body);
        if (!datapod.owner) {
            throw new Error('Invalid url');
        }
    });
}