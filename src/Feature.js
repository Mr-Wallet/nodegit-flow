const Promise = require('nodegit-promise');
const NodeGit = require('nodegit');
const Config = require('./Config');

const constants = require('./constants');
const utils = require('./utils');

class Feature {
  constructor(repo, config) {
    this.repo = repo;
    this.config = config;
  }

  /**
   * Static method to start a feature
   * @param {Object} the repo to start a feature in
   * @param {String} new branch name to start feature with
   * @param {Object} the options for start feature
   */
  static startFeature(repo, featureName, options = {}) {
    const {sha} = options;

    if (!repo) {
      return Promise.reject(new Error(constants.ErrorMessage.REPO_REQUIRED));
    }

    if (!featureName) {
      return Promise.reject(new Error('Feature name is required'));
    }

    let featureBranchName;
    let featureBranch;

    return Config.getConfig(repo)
      .then((config) => {
        const featurePrefix = config['gitflow.prefix.feature'];
        const developBranchName = config['gitflow.branch.develop'];

        featureBranchName = featurePrefix + featureName;
        if (sha) {
          return NodeGit.Commit.lookup(repo, sha);
        }

        return NodeGit.Branch.lookup(
          repo,
          developBranchName,
          NodeGit.Branch.BRANCH.LOCAL
        )
        .then((developBranch) => NodeGit.Commit.lookup(repo, developBranch.target()));
      })
      .then((fromCommit) => repo.createBranch(featureBranchName, fromCommit))
      .then((_featureBranch) => {
        featureBranch = _featureBranch;
        return repo.checkoutBranch(featureBranch);
      })
      .then(() => featureBranch);
  }

  /**
   * Static method to finish a feature
   * @param {Object} the repo to start a feature in
   * @param {String} branch name to finish feature with
   * @param {Object} options for finish feature
   */
  static finishFeature(repo, featureName, options = {}) {
    const {keepBranch, isRebase} = options;

    if (!repo) {
      return Promise.reject(new Error('Repo is required'));
    }

    if (!featureName) {
      return Promise.reject(new Error('Feature name is required'));
    }

    let developBranch;
    let featureBranch;
    let developCommit;
    let featureCommit;
    let cancelDevelopMerge;
    let mergeCommit;
    let featureBranchName;
    return Config.getConfig(repo)
      .then((config) => {
        const developBranchName = config['gitflow.branch.develop'];
        featureBranchName = config['gitflow.prefix.feature'] + featureName;

        return Promise.all(
          [developBranchName, featureBranchName]
            .map((branchName) => NodeGit.Branch.lookup(repo, branchName, NodeGit.Branch.BRANCH.LOCAL))
        );
      })
      .then((branches) => {
        developBranch = branches[0];
        featureBranch = branches[1];

        return Promise.all(branches.map((branch) => repo.getCommit(branch.target())));
      })
      .then((commits) => {
        developCommit = commits[0];
        featureCommit = commits[1];

        // If the develop branch and feautre branch point to the same thing do not merge them
        // or if the `isRebase` parameter is true do not merge
        const isSameCommit = developCommit.id().toString() === featureCommit.id().toString();
        cancelDevelopMerge = isSameCommit || isRebase;

        if (!cancelDevelopMerge) {
          return utils.Repo.merge(developBranch, featureBranch, repo);
        } else if (isRebase && !isSameCommit) {
          return utils.Repo.rebase(developBranch, featureBranch, repo);
        }
        return Promise.resolve();
      })
      .then((_mergeCommit) => {
        mergeCommit = _mergeCommit;
        return repo.checkoutBranch(developBranch);
      })
      .then(() => {
        if (keepBranch) {
          return Promise.resolve();
        }

        return NodeGit.Branch.lookup(repo, featureBranchName, NodeGit.Branch.BRANCH.LOCAL)
          .then((branch) => branch.delete());
      })
      .then(() => mergeCommit);
  }

  /**
   * Instance method to start a feature
   * @param {String} branch name to finish feature with
   */
  startFeature() {
    return Feature.startFeature(this.repo, ...arguments);
  }

  /**
   * Instance method to finish a feature
   * @param {String} branch name to finish feature with
   * @param {Boolean} option to keep feature branch after finishing
   * @param {Boolean} option to rebase on the develop branch instead of merge
   */
  finishFeature() {
    return Feature.finishFeature(this.repo, ...arguments);
  }
}

module.exports = Feature;
