const request = require('request-promise-native');
const { sort_by_properties } = require('../helpers/sorters');
const formvalidator = require('../helpers/formvalidator');
const { FormError } = require('../errors/errors');
const pod = require('../helpers/datapods');
const urljoin = require('url-join');
const { urlcompare } = require('../helpers/urlcompare')

// Contact list page
exports.contact_list_page = function (req, res) {

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
            return { 'firstname': ownerlist[i].givenName, 'lastname': ownerlist[i].familyName, 'nickname': contact.nickname, 'id': contact._id, 'image': ownerlist[i].image }
        });

        res.render('contacts/index', {
            contacts: contacts // Pass contacts to handlebars
        });
    }).catch(err => {
        req.flash('error_msg', err.toString());
        console.error(err);
    });
}

// Add contact page
exports.add_contact_page = function (req, res) {
    res.render('contacts/add');
}

// Process add contact
exports.add_contact = function (req, res) {

    validateContactForm(req, res).then(() => {
        return pod.getContactPodUrl(req.user.datapod);
    }).then(contactpod_url => {
        // Configure the request
        const options = {
            url: contactpod_url,
            method: 'PUT',
            headers: {
                'content-type': 'application/json'
            },
            form: {
                'reference': req.body.reference,
                'nickname': req.body.nickname
            }
        }
        return request(options);
    }).then(body => {
        req.flash('success_msg', 'Contact added'); // Flash success message
        res.redirect('/contacts');
    }).catch((err) => {
        let args = {reference: req.body.reference, nickname: req.body.nickname};
        handleFormErrors(err, args);
        res.render('contacts/add', args);
    });

}

// Edit contact page
exports.edit_contact_page = function (req, res) {

    pod.getContactPod(req.user.datapod).then(contacts => {
        let contact = contacts.find(contact => contact._id === req.params.id);

        res.render('contacts/edit', {
            reference: contact.reference,
            nickname: contact.nickname,
            id: contact._id
        });
    }).catch((err) => {
        req.flash('error_msg', err.toString());
        console.error(err);
    });
}

// Process edit contact
exports.update_contact = function (req, res) {

    validateContactForm(req, res).then(() => {
        return pod.getContactPod(req.user.datapod);
    }).then(contacts => {
        return getContact(contacts, req.params.id);
    }).then(contact => {
        const options = {
            url: contact.identifier,
            method: 'PATCH',
            headers: {
                'content-type': 'application/json'
            },
            form: {
                'reference': req.body.reference,
                'nickname': req.body.nickname
            }
        }

        // Start the request
        return request(options);
    }).then(body => {
        req.flash('success_msg', 'Contact updated'); // Flash success message
        res.redirect('/contacts');
    }).catch((err) => {
        let args = {reference: req.body.reference, nickname: req.body.nickname, id: req.params.id };
        handleFormErrors(err, args);
        res.render('contacts/edit', args);
    });
}
// Process delete contact
exports.delete_contact = function (req, res) {

    pod.getContactPodUrl(req.user.datapod).then(contactpod => {
        const options = {
            url: urljoin(contactpod, req.params.id),
            method: 'DELETE',
            headers: {}
        }
        return request(options);
    }).then(() => {
        req.flash('success_msg', 'Contact removed'); // Flash success message
        res.redirect('/contacts');
    }).catch((err) => {
        req.flash('error_msg', err.toString());
        console.error(err);
    });
}

// Contact info page
exports.contact_info_page = function (req, res) {

    let contact = pod.getContactPod(req.user.datapod).then(contacts => {
        return getContact(contacts, req.params.id);
    });

    let owner = contact.then(contact => {
        return pod.getOwnerPod(contact.reference)
    });

    // Render info page
    Promise.all([contact, owner]).then(([contact, owner]) => {

        res.render('contacts/info', {
            firstname: owner.givenName,
            lastname: owner.familyName,
            nickname: contact.nickname,
            image: owner.image,
        });

    }).catch(err => {
        req.flash('error_msg', err.toString());
        console.error(err);
    });

}

/* ------------------------- *
 *     Helper functions      *
 * ------------------------- */ 
const getContact = (contactlist, id) => {
    return new Promise((resolve, reject) => {
        let contact = contactlist.find(con => con._id === id);
        if (contact) {
            resolve(contact);
        } else {
            reject(Error("Contact with id " + id + " not found"));
        }
    });
};

// Checks if all form fields are filled in and are correct
function validateContactForm(req, res) {
    return formvalidator.validate(req, res, [
        [!urlcompare(req.body.reference, req.user.datapod), 'You can\'t add yourself as a contact.'],
        [req.body.nickname, 'Please fill in a nickname'],
        [req.body.reference, 'Please fill in a data pod url']
    ]).catch((errorlist) => Promise.reject(new FormError(errorlist)))
        .then(() => {
            return pod.checkIfDatapod(req.body.reference);
        });
}

function handleFormErrors(err, args) {
    if (err instanceof FormError) {
        args["errors"] = err.errorlist;
    } else if (err instanceof Error) {
        args["errors"] = [{ text: 'Invalid URL: URL doesn\'t point to a datapod' }];
    } else {
        req.flash('error_msg', err.toString());
        console.error(err);
    }
}