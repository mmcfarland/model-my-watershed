"use strict";

var Backbone = require('../../shim/backbone'),
    _ = require('lodash'),
    App = require('../app'),
    coreModels = require('../core/models');

var ModelPackageControlModel = Backbone.Model.extend({
    defaults: {
        name: ''
    }
});

var ModelPackageControlsCollection = Backbone.Collection.extend({
    model: ModelPackageControlModel
});

var ModelPackageModel = Backbone.Model.extend();

var Tr55TaskModel = coreModels.TaskModel.extend({});

var ResultModel = Backbone.Model.extend({});

var ResultCollection = Backbone.Collection.extend({
    model: ResultModel
});

var ProjectModel = Backbone.Model.extend({
    urlRoot: '/api/modeling/projects/',

    defaults: {
        name: '',
        created_at: null,          // Date
        area_of_interest: null,    // GeoJSON
        model_package: '',         // Package name
        taskModel: null,           // TaskModel
        scenarios: null,           // ScenariosCollection
        user_id: 0                 // User that created the project
    },

    initialize: function() {
        var scenarios = this.get('scenarios');
        if (scenarios === null || typeof scenarios === 'string') {
            this.set('scenarios', new ScenariosCollection());
        }
        // TODO: For a new project, users will eventually
        // be able to choose which modeling package
        // they want to use in their project. For
        // now, the only option is TR55, so it is
        // hard-coded here.
        this.set('model_package', 'tr-55');
        this.set('taskModel', new Tr55TaskModel());
        this.set('user_id', App.user.get('id'));

        this.listenTo(this.get('scenarios'), 'add', this.addIdsToScenarios, this);
        this.on('change:name', this.saveProjectAndScenarios, this);
    },

    updateName: function(newName) {
        // TODO: Having fetched a users list of projects,
        // ensure that this new name is unique prior to saving
        this.set('name', newName);
    },

    saveProjectAndScenarios: function() {
        if (App.user.get('id') !== this.get('user_id') || App.user.get('id') < 1) {
            return;
        }

        if (!this.get('id')) {
            // We haven't saved the project before, save the project and then
            // set the project ID on each scenario, then reattach the senarios
            // to the project.
            var self = this;
            this.save()
                .done(function() {
                    self.updateProjectScenarios(self.get('id'), self.get('scenarios'));
                })
                .fail(function() {
                    console.log('Failed to save project');
                });
        } else {
            this.save()
                .fail(function() {
                    console.log('Failed to save project');
                });
        }
    },

    addIdsToScenarios: function() {
        var projectId = this.get('id');
        if (!projectId) {
            this.saveProjectAndScenarios();
        } else {
            this.updateProjectScenarios(projectId, this.get('scenarios'));
        }
    },

    updateProjectScenarios: function(projectId, scenarios) {
        scenarios.each(function(scenario) {
            if (!scenario.get('project')) {
                scenario.set('project', projectId);
            }
        });
    },

    parse: function(response, options) {
        if (response.scenarios) {
            // If we returned scenarios (probably from a GET) then set them.
            var user_id = response.user.id,
                scenariosCollection = this.get('scenarios'),
                scenarios = _.map(response.scenarios, function(scenario) {
                    var scenarioModel = new ScenarioModel(scenario);
                    scenarioModel.set('user_id', user_id);
                    scenarioModel.get('modifications').reset(scenario.modifications);
                    return scenarioModel;
                });
            scenariosCollection.reset(scenarios);
            // Set the user_id to ensure controls are properly set.
            response.user_id = user_id;

            delete response.scenarios;
        }

        // TODO: Does this hurt anything if we always set.
        response.taskModel = new Tr55TaskModel();

        return response;
    }
});

var ModificationModel = coreModels.GeoModel.extend({
    defaults: _.extend({
            name: '',
            type: ''
        }, coreModels.GeoModel.prototype.defaults
    )
});

var ModificationsCollection = Backbone.Collection.extend({
    model: ModificationModel
});

// Static method to create an instance of this collection.
// This lets us create a collection from an array of raw objects (web app)
// or from an array of models (unit tests).
ModificationsCollection.create = function(data) {
    if (data instanceof ModificationsCollection) {
        return data;
    } else {
        return new ModificationsCollection(data);
    }
};

var ScenarioModel = Backbone.Model.extend({
    urlRoot: '/api/modeling/scenarios/',

    defaults: {
        name: '',
        is_current_conditions: false,
        modifications: null, // ModificationsCollection
        active: false,
        user_id: 0 // User that created the project
    },

    initialize: function(attrs, options) {
        Backbone.Model.prototype.initialize.apply(this, arguments);
        this.set('user_id', App.user.get('id'));
        this.set('modifications', ModificationsCollection.create(attrs.modifications));

        this.on('change:project change:name', this.attemptSave, this);
        this.get('modifications').on('add remove', this.attemptSave, this);
    },

    attemptSave: function() {
        if (App.user.get('id') !== this.get('user_id') || App.user.get('id') < 1) {
            return;
        }
        this.save().fail(function() {
            console.log('Failed to save scenario');
        });
    },

    getSlug: function() {
        var slug = this.get('name')
                       .toLowerCase()
                       .replace(/ /g, '-') // Spaces to hyphens
                       .replace(/[^\w-]/g, ''); // Remove non-alphanumeric characters
        return slug;
    },

    addModification: function(modification) {
        this.get('modifications').add(modification);
    },

    addOrReplaceModification: function(modification) {
        var modificationsColl = this.get('modifications'),
            existing = modificationsColl.findWhere({ name: modification.get('name') });
        if (existing) {
            modificationsColl.remove(existing);
        }
        modificationsColl.add(modification);
    },

    parse: function(response, options) {
        // Modifications are essentially write only. So if we have them on our
        // model, we shouldn't reset them from the server. Pull them off of
        // the response to prevent overwriting them.
        delete response.modifications;
        return response;
     }
});

var ScenariosCollection = Backbone.Collection.extend({
    model: ScenarioModel,
    comparator: 'created_at',

    initialize: function() {
        this.on('reset', this.makeFirstScenarioActive);
    },

    makeFirstScenarioActive: function() {
        var first = this.first();

        if (first) {
            this.setActiveScenario(first.cid);
        }
    },

    setActiveScenario: function(cid) {
        var result = null;
        this.each(function(model) {
            var active = model.cid === cid;
            if (active) {
                result = model;
            }
            model.set('active', active);
        });
        this.trigger('change:activeScenario', result);
    },

    createNewScenario: function() {
        var scenario = new ScenarioModel({
            name: this.makeNewScenarioName('New Scenario')
        });

        this.add(scenario);
        this.setActiveScenario(scenario.cid);
    },

    updateScenarioName: function(model, newName) {
        newName = newName.trim();

        // Bail early if the name actually didn't change.
        if (model.get('name') === newName) {
            return;
        }

        var match = this.find(function(model) {
            return model.get('name').toLowerCase() === newName.toLowerCase();
        });

        if (match) {
            console.log('This name is already in use.');
            return;
        } else if (model.get('name') !== newName) {
            model.set('name', newName);
        }
    },

    duplicateScenario: function(cid) {
        var source = this.get(cid),
            sourceMods = source.get('modifications').models,
            newModel = new ScenarioModel({
                is_current_conditions: false,
                name: this.makeNewScenarioName('Copy of ' + source.get('name')),
                modifications: new ModificationsCollection(sourceMods)
            });

        this.add(newModel);
        this.setActiveScenario(newModel.cid);
    },

    // Generate a unique scenario name based off baseName.
    // Assumes a basic structure of "baseName X", where X is
    // iterated as new scenarios with the same baseName are created.
    // The first duplicate will not have an iterated X in the name.
    // The second duplicate will be "baseName 1".
    makeNewScenarioName: function(baseName) {
        var existingNames = this.pluck('name');

        if (!_.contains(existingNames, baseName)) {
            return baseName;
        }

        for (var i=1; _.contains(existingNames, baseName + ' ' + i); i++);

        return baseName + ' ' + i;
    }
});

function getControlsForModelPackage(modelPackageName) {
    switch (modelPackageName) {
        case 'tr-55':
            return new ModelPackageControlsCollection([
                new ModelPackageControlModel({ name: 'landcover' }),
                new ModelPackageControlModel({ name: 'conservation_practice' }),
                new ModelPackageControlModel({ name: 'precipitation' })
            ]);
    }
    throw 'Model package not supported ' + modelPackageName;
}

module.exports = {
    getControlsForModelPackage: getControlsForModelPackage,
    ResultModel: ResultModel,
    ResultCollection: ResultCollection,
    ModelPackageModel: ModelPackageModel,
    ModelPackageControlsCollection: ModelPackageControlsCollection,
    ModelPackageControlModel: ModelPackageControlModel,
    Tr55TaskModel: Tr55TaskModel,
    ProjectModel: ProjectModel,
    ModificationModel: ModificationModel,
    ModificationsCollection: ModificationsCollection,
    ScenarioModel: ScenarioModel,
    ScenariosCollection: ScenariosCollection
};
