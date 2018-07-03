const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const formvalidator = require('../helpers/formvalidator');
const { FormError, UserError } = require('../errors/errors');
const request = require('request-promise-native');
const pod = require('../helpers/datapods');
const validator = require('validator');

// Load User Model
require('../models/User');
const User = mongoose.model('users');

// Display login page
exports.login_page = function (req, res) {
    res.render('users/login');
}

// Display register page
exports.register_page = function (req, res) {
    res.render('users/register');
}

// User login
exports.login = function (req, res, next) {
    passport.authenticate('local', {
        successRedirect: '/messages',
        failureRedirect: '/users/login',
        failureFlash: true
    })(req, res, next);
}

// User register
exports.register = function (req, res) {

    const user = validateRegisterForm(req, res).then(() => {
        return request(req.body.datapod);
    }).then(body => {
        let datapod = JSON.parse(body);
        if (!datapod.owner) {
            throw new Error('Invalid url');
        }
    }).then(() => {
        return User.findOne({ username: req.body.username });
    }).then(user => {
        if (user) { // Already registered
            throw new UserError('Username already registered');
        } else {
            return bcrypt.genSalt(10);
        }
    }).then(salt => {
        return bcrypt.hash(req.body.password, salt);
    }).then(hash => {
        return new User({
            username: req.body.username,
            password: hash,
            datapod: req.body.datapod
        }).save();
    }).then(user => {
        req.flash('success_msg', 'Registration successful, please log in');
        res.redirect('/users/login');
    }).catch((err) => {

        if (err instanceof FormError) {
            res.render('users/register', {
                errors: err.errorlist,
                username: req.body.username,
                datapod: req.body.datapod
            });
        } else if (err instanceof UserError) {
            req.flash('error_msg', 'Username already registered');
            res.redirect('/users/register');
        } else {
            req.flash('error_msg', err.toString());
            res.redirect('/users/register');
        }
    });
}

// User logout
exports.logout = function (req, res) {
    req.logout();
    req.flash('success_msg', 'You are now logged out');
    res.redirect('/users/login');
}

// User profile page
exports.profile_page = function (req, res) {
    pod.getOwnerPod(req.user.datapod).then(ownerpod => {
        res.render('users/profile', {
            firstname: ownerpod.givenName,
            lastname: ownerpod.familyName,
            phone: ownerpod.telephone,
            gender: ownerpod.gender,
            email: ownerpod.email,
            image: ownerpod.image
        });
    }).catch(err => {
        req.flash('error_msg', err.toString());
        console.error(err);
    });

}

// Change password page
exports.settings_page = function (req, res) {
    res.render('users/settings', {
        datapod: req.user.datapod
    });
}

// Update profile
exports.update_profile = function (req, res) {
    validateUpdateProfileForm(req, res).then(() => {
        return pod.getOwnerPodUrl(req.user.datapod);
    }).then(ownerpod_url => {
        let form = { givenName: req.body.firstname, familyName: req.body.lastname }
        if (req.body.phone) {
            form["telephone"] = req.body.phone;
        }

        if (req.body.gender) {
            form["gender"] = req.body.gender;
        }

        if (req.body.email) {
            form['email'] = req.body.email;
        }

        if (req.body.image) {
            form['image'] = req.body.image;
        }

        const options = {
            url: ownerpod_url,
            method: 'PATCH',
            headers: {
                'content-type': 'application/json'
            },
            form: form
        }

        request(options);

    }).then(() => {
        res.redirect('/users/profile');
    }).catch((err) => {

        if (err instanceof FormError) {
            res.render('users/profile', {
                errors: err.errorlist,
                firstname: req.body.firstname,
                lastname: req.body.lastname,
                phone: req.body.phone,
                gender: req.body.gender,
                email: req.body.email,
                image: req.body.image
            });
        } else {
            req.flash('error_msg', err.toString());
            res.redirect('/users/profile');
        }
    });
}

exports.update_datapod = function (req, res) {

    request(req.body.datapod).then(body => {
        let datapod = JSON.parse(body);
        if (!datapod.owner) {
            throw new Error('Invalid url');
        }
    }).then(() => {
        const newvalues = { $set: { datapod: req.body.datapod } };
        return User.updateOne({ _id: req.user._id }, newvalues);
    }).then(() => {
        res.redirect('/users/settings')
    }).catch(err => {
        req.flash('error_msg', 'Invalid url');
        res.redirect('/users/settings');
    });

}

exports.update_password = function (req, res) {

    const salt = validatePasswordForm(req, res).then(() => {
        return bcrypt.genSalt(10);
    });

    let correct = bcrypt.compare(req.body.oldpass, req.user.password).then((same) => {
        if (!same) {
            throw new Error('Password incorrect');
        } else {
            return bcrypt.genSalt(10);
        }
    }).then(salt => {
        return bcrypt.hash(req.body.newpass, salt);
    }).then(hash => {
        const newvalues = { $set: { password: hash } };
        return User.updateOne({ _id: req.user._id }, newvalues);
    }).then(() => {
        req.flash('success_msg', 'Password change success');
        res.redirect('/users/profile');
    }).catch((err) => {

        if (err instanceof FormError) {
            res.render('users/profile', {
                errors: err.errorlist,
            });
        } else {
            req.flash('error_msg', err.toString());
            res.redirect('/users/profile');
        }
    });

}

// Checks if all form fields are filled in
function validateRegisterForm(req, res, onFail, onSuccess) {
    return formvalidator.validate(req, res, [
        [req.body.password == req.body.password2, 'Passwords do not match'],
        [req.body.password.length >= 6, 'Password must be at least 6 characters']
    ]).catch((errorlist) => Promise.reject(new FormError(errorlist)));
}

// Checks if all form fields are filled in
function validateUpdateProfileForm(req, res, onFail, onSuccess) {
    return formvalidator.validate(req, res, [
        [req.body.firstname, 'Firstname must not be empty'],
        [req.body.lastname, 'Lastname must not be empty'],
        [!req.body.email || validator.isEmail(req.body.email), 'Invalid email address'],
        [!req.body.phone || validator.isMobilePhone(req.body.phone, 'any'), 'Please enter a valid phone number']
    ]).catch((errorlist) => Promise.reject(new FormError(errorlist)));
}

// Checks if all form fields are filled in
function validatePasswordForm(req, res, onFail, onSuccess) {
    return formvalidator.validate(req, res, [
        [req.body.newpass == req.body.newpass2, 'Passwords do not match'],
        [req.body.newpass.length >= 6, 'Password must be at least 6 characters']
    ]).catch((errorlist) => Promise.reject(new FormError(errorlist)));
}