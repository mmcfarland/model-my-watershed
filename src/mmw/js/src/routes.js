'use strict';

var router = require('./router').router,
    controllers = require('./controllers'),
    AppController = controllers.AppController,
    ErrorController = require('./core/error/controllers').ErrorController,
    SignUpController = require('./user/controllers').SignUpController,
    DrawController = require('./draw/controllers').DrawController,
    ModelingController = require('./modeling/controllers').ModelingController,
    AnalyzeController = require('./analyze/controllers').AnalyzeController;

router.addRoute(/^/, DrawController, 'draw');
router.addRoute(/^analyze/, AnalyzeController, 'analyze');
router.addRoute(/^project/, ModelingController, 'project');
router.addRoute('project/:projectId', ModelingController, 'project');
router.addRoute('project/:projectId/', ModelingController, 'project');
router.addRoute('project/:projectId/scenario/:scenarioId/', ModelingController, 'project');
router.addRoute(/^compare/, AppController, 'compare');
router.addRoute('error(/)(:type)', ErrorController, 'error');
router.addRoute('sign-up(/)', SignUpController, 'signUp');
router.addRoute('sign-up/itsi(/)(:username)(/:first_name)(/:last_name)', SignUpController, 'itsiSignUp');
