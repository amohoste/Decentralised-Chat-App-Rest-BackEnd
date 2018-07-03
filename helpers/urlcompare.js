const { URL } = require('url');

module.exports = {

    // Helper function to compare URL's
    urlcompare: function (url1, url2) {
        let result;
        try {
            result = new URL(url1).toString() === new URL(url2).toString();
        } catch (error) {
            return false;
        }
        return result;
    }
}

