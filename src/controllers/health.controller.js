const check = (req, res) => {
    res.status(200).json({
        message: 'Health Check Pass',
        status: 'ok'
    })
}

module.exports = {
    check
};