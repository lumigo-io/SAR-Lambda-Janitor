# SAR-Lambda-Janitor

[![Version](https://img.shields.io/badge/semver-1.7.0-blue)](template.yml)
[![Greenkeeper badge](https://badges.greenkeeper.io/lumigo/SAR-Lambda-Janitor.svg)](https://greenkeeper.io/)
[![CircleCI](https://circleci.com/gh/lumigo-io/SAR-Lambda-Janitor.svg?style=svg)](https://circleci.com/gh/lumigo/SAR-Lambda-Janitor)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Cron job for deleting old, unused versions of your Function.

This [post](https://lumigo.io/blog/a-serverless-application-to-clean-up-old-deployment-packages/) explains the problem and why we created this app.

## Safeguards

To guard against deleting live versions, some safeguards are in place:

* **Never delete the $LATEST version**. This is the default version that will be used when you invoke a function.
* **Never delete versions that are  referenced by an alias**. If you use aliases to manage different stages - dev, staging, etc. then the latest version referenced by your aliases will not be deleted.
* **Keeping the most recent N versions**. Even if you don't use aliases at all, we will always keep the most recent N versions, where N can be configured with the `VersionsToKeep` parameter when you install the app. **Defaults to 3**.

## Deploying to your account (via the console)

Go to this [page](https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:374852340823:applications~lambda-janitor) and click the `Deploy` button.

This app would deploy the following resources to your region:

* a Lambda function that scans the functions in your region and deletes unused versions
* a CloudWatch event schedule that triggers the Lambda function every hour

## Deploying via SAM/Serverless framework/CloudFormation

To deploy this app via SAM, you need something like this in the CloudFormation template:

```yml
AutoDeployMyAwesomeLambdaLayer:
  Type: AWS::Serverless::Application
  Properties:
    Location:
      ApplicationId: arn:aws:serverlessrepo:us-east-1:374852340823:applications/lambda-janitor
      SemanticVersion: <enter latest version>
    Parameters:
      VersionsToKeep: <defaults to 3>
```

To do the same via CloudFormation or the Serverless framework, you need to first add the following `Transform`:

```yml
Transform: AWS::Serverless-2016-10-31
```

For more details, read this [post](https://theburningmonk.com/2019/05/how-to-include-serverless-repository-apps-in-serverless-yml/).
