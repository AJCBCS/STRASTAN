// lib/hr-cdk-stack-stack.js

// Load environment variables
require('dotenv').config();

const { Stack, RemovalPolicy, CfnOutput } = require('aws-cdk-lib');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigateway = require('aws-cdk-lib/aws-apigateway');
const cognito = require('aws-cdk-lib/aws-cognito');
const { NodejsFunction } = require('aws-cdk-lib/aws-lambda-nodejs');
const path = require('path');
const sns = require('aws-cdk-lib/aws-sns');
const sqs = require('aws-cdk-lib/aws-sqs');
const subscriptions = require('aws-cdk-lib/aws-sns-subscriptions');
const lambdaEventSources = require('aws-cdk-lib/aws-lambda-event-sources');

class HrCdkStackStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    if (!process.env.PERSONNEL_TABLE_NAME || !process.env.ORGANIZATIONAL_TABLE_NAME || !process.env.AES_SECRET_KEY) {
      throw new Error('Missing required environment variables. Check .env for PERSONNEL_TABLE_NAME, ORGANIZATIONAL_TABLE_NAME, and AES_SECRET_KEY.');
    }

    const userPool = new cognito.UserPool(this, 'AisaacUseCaseHRUserPool', {
      userPoolName: 'HR-System-User-Pool',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'AisaacUseCaseHRUserPoolClient', {
      userPool,
      generateSecret: false,
      authFlows: { userPassword: true },
    });

    const departmentTopic = new sns.Topic(this, 'DepartmentChangeTopic', {
      topicName: 'department-change-topic',
    });

    const departmentQueue = new sqs.Queue(this, 'DepartmentAggregationQueue', {
      queueName: 'department-aggregation-queue',
    });

    const personnelTable = new dynamodb.Table(this, 'AisaacUseCasePersonnelTable', {
      tableName: process.env.PERSONNEL_TABLE_NAME,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    personnelTable.addGlobalSecondaryIndex({
      indexName: 'DepartmentIndex',
      partitionKey: { name: 'departmentId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const organizationalTable = new dynamodb.Table(this, 'AisaacUseCaseOrganizationalTable', {
      tableName: process.env.ORGANIZATIONAL_TABLE_NAME,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const lambdaEnvironment = {
      PERSONNEL_TABLE_NAME: personnelTable.tableName,
      ORGANIZATIONAL_TABLE_NAME: organizationalTable.tableName,
      AES_SECRET_KEY: process.env.AES_SECRET_KEY,
      DEPARTMENT_TOPIC_ARN: departmentTopic.topicArn,
    };

    const api = new apigateway.RestApi(this, 'AisaacUseCaseHRComprehensiveRESTAPI', {
      restApiName: 'HR Comprehensive System REST API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'AisaacUseCaseHRCognitoAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });

    const functionProps = (entryPath) => ({
      entry: path.join(__dirname, entryPath),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: lambdaEnvironment,
    });

    const createEmployeeLambda = new NodejsFunction(this, 'CreateEmployeeLambda', functionProps('../lambda/personnel/dev-employee/createEmployee.js'));
    const getEmployeeDetailsLambda = new NodejsFunction(this, 'GetEmployeeDetailsLambda', functionProps('../lambda/personnel/dev-employee/getEmployee.js'));
    const updateEmployeeLambda = new NodejsFunction(this, 'UpdateEmployeeLambda', functionProps('../lambda/personnel/dev-employee/updateEmployee.js'));
    const deleteEmployeeLambda = new NodejsFunction(this, 'DeleteEmployeeLambda', functionProps('../lambda/personnel/dev-employee/deleteEmployee.js'));
    const getPersonalDataLambda = new NodejsFunction(this, 'GetPersonalDataLambda', functionProps('../lambda/personnel/dev-personalData/getPersonalData.js'));
    const updatePersonalDataLambda = new NodejsFunction(this, 'UpdatePersonalDataLambda', functionProps('../lambda/personnel/dev-personalData/updatePersonalData.js'));
    const getContactInfoLambda = new NodejsFunction(this, 'GetContactInfoLambda', functionProps('../lambda/personnel/dev-contactInfo/getContactInfo.js'));
    const updateContactInfoLambda = new NodejsFunction(this, 'UpdateContactInfoLambda', functionProps('../lambda/personnel/dev-contactInfo/updateContactInfo.js'));
    const getContractDetailsLambda = new NodejsFunction(this, 'GetContractDetailsLambda', functionProps('../lambda/personnel/dev-contractDetails/getContractDetails.js'));
    const updateContractDetailsLambda = new NodejsFunction(this, 'UpdateContractDetailsLambda', functionProps('../lambda/personnel/dev-contractDetails/updateContractDetails.js'));
    const listEmployeesLambda = new NodejsFunction(this, 'ListEmployeesLambda', functionProps('../lambda/personnel/listEmployees.js'));
    const searchEmployeesLambda = new NodejsFunction(this, 'SearchEmployeesLambda', functionProps('../lambda/personnel/searchEmployees.js'));

    const createDepartmentLambda = new NodejsFunction(this, 'CreateDepartmentLambda', functionProps('../lambda/organization/dev-department/createDepartment.js'));
    const createPositionLambda = new NodejsFunction(this, 'CreatePositionLambda', functionProps('../lambda/organization/dev-position/createPosition.js'));
    const createPositionMethodLambda = new NodejsFunction(this, 'CreatePositionMethodLambda', functionProps('../lambda/organization/dev-position/createPositionMethod.js'));
    const createOrgUnitLambda = new NodejsFunction(this, 'CreateOrgUnitLambda', functionProps('../lambda/organization/dev-orgUnit/createOrgUnit.js'));
    const createJobClassificationLambda = new NodejsFunction(this, 'CreateJobClassificationLambda', functionProps('../lambda/organization/dev-jobClassification/createJobClassification.js'));
    const getDepartmentsRequestLambda = new NodejsFunction(this, 'GetDepartmentsRequestLambda', functionProps('../lambda/organization/dev-department/getDepartmentsRequestPublisher.js'));
    const getDepartmentLambda = new NodejsFunction(this, 'GetDepartmentLambda', functionProps('../lambda/organization/dev-department/getDepartment.js'));
    const getPositionLambda = new NodejsFunction(this, 'GetPositionLambda', functionProps('../lambda/organization/dev-position/getPosition.js'));
    const getOrgUnitLambda = new NodejsFunction(this, 'GetOrgUnitLambda', functionProps('../lambda/organization/dev-orgUnit/getOrgUnit.js'));
    const getJobClassificationLambda = new NodejsFunction(this, 'GetJobClassificationLambda', functionProps('../lambda/organization/dev-jobClassification/getJobClassification.js'));
    const listDepartmentLambda = new NodejsFunction(this, 'ListDepartmentLambda', functionProps('../lambda/organization/dev-department/listDepartment.js'));
    const listPositionLambda = new NodejsFunction(this, 'ListPositionLambda', functionProps('../lambda/organization/dev-position/listPosition.js'));
    const listOrgUnitLambda = new NodejsFunction(this, 'ListOrgUnitLambda', functionProps('../lambda/organization/dev-orgUnit/listOrgUnit.js'));
    const listJobClassificationLambda = new NodejsFunction(this, 'ListJobClassificationLambda', functionProps('../lambda/organization/dev-jobClassification/listJobClassification.js'));

    const departmentAggregatorLambda = new NodejsFunction(this, 'DepartmentAggregatorLambda', functionProps('../lambda/organization/dev-department/departmentAggregator.js'));

    personnelTable.grantReadWriteData(createEmployeeLambda);
    personnelTable.grant(updateEmployeeLambda, 'dynamodb:TransactWriteItems', 'dynamodb:PutItem');
    personnelTable.grant(deleteEmployeeLambda, 'dynamodb:UpdateItem');
    personnelTable.grant(getEmployeeDetailsLambda, 'dynamodb:Query');
    personnelTable.grant(getPersonalDataLambda, 'dynamodb:GetItem');
    personnelTable.grant(updatePersonalDataLambda, 'dynamodb:UpdateItem');
    personnelTable.grant(getContactInfoLambda, 'dynamodb:GetItem');
    personnelTable.grant(updateContactInfoLambda, 'dynamodb:TransactWriteItems', 'dynamodb:UpdateItem', 'dynamodb:ConditionCheckItem');
    personnelTable.grant(getContractDetailsLambda, 'dynamodb:GetItem');
    personnelTable.grant(updateContractDetailsLambda, 'dynamodb:TransactWriteItems', 'dynamodb:UpdateItem', 'dynamodb:ConditionCheckItem');
    personnelTable.grant(listEmployeesLambda, 'dynamodb:Scan');
    personnelTable.grant(searchEmployeesLambda, 'dynamodb:Scan');
    personnelTable.grant(createDepartmentLambda, 'dynamodb:GetItem');
    personnelTable.grantReadData(departmentAggregatorLambda);

    organizationalTable.grantReadData(departmentAggregatorLambda);
    organizationalTable.grantWriteData(departmentAggregatorLambda);
    organizationalTable.grantReadWriteData(createDepartmentLambda);
    organizationalTable.grantReadWriteData(createPositionLambda);
    organizationalTable.grantReadWriteData(createOrgUnitLambda);
    organizationalTable.grantReadWriteData(createJobClassificationLambda);
    organizationalTable.grantReadWriteData(createPositionMethodLambda);
    organizationalTable.grantReadData(getDepartmentLambda);
    organizationalTable.grantReadData(getPositionLambda);
    organizationalTable.grantReadData(getOrgUnitLambda);
    organizationalTable.grantReadData(getJobClassificationLambda);
    organizationalTable.grantReadData(listDepartmentLambda);
    organizationalTable.grantReadData(listPositionLambda);
    organizationalTable.grantReadData(listOrgUnitLambda);
    organizationalTable.grantReadData(listJobClassificationLambda);

    departmentTopic.grantPublish(getDepartmentsRequestLambda);

    const employees = api.root.addResource('personnel').addResource('employees');
    const employeeId = employees.addResource('{employeeId}');

    const addAuthorizedMethod = (resource, method, integration) => {
      resource.addMethod(method, integration, {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: authorizer,
      });
    };

    addAuthorizedMethod(employees, 'POST', new apigateway.LambdaIntegration(createEmployeeLambda));
    addAuthorizedMethod(employees, 'GET', new apigateway.LambdaIntegration(listEmployeesLambda));
    addAuthorizedMethod(employeeId, 'GET', new apigateway.LambdaIntegration(getEmployeeDetailsLambda));
    addAuthorizedMethod(employeeId, 'PUT', new apigateway.LambdaIntegration(updateEmployeeLambda));
    addAuthorizedMethod(employeeId, 'DELETE', new apigateway.LambdaIntegration(deleteEmployeeLambda));

    const personalData = employeeId.addResource('personal-data');
    addAuthorizedMethod(personalData, 'GET', new apigateway.LambdaIntegration(getPersonalDataLambda));
    addAuthorizedMethod(personalData, 'PUT', new apigateway.LambdaIntegration(updatePersonalDataLambda));

    const contactInfo = employeeId.addResource('contact-info');
    addAuthorizedMethod(contactInfo, 'GET', new apigateway.LambdaIntegration(getContactInfoLambda));
    addAuthorizedMethod(contactInfo, 'PUT', new apigateway.LambdaIntegration(updateContactInfoLambda));

    const contractDetails = employeeId.addResource('contract-details');
    addAuthorizedMethod(contractDetails, 'GET', new apigateway.LambdaIntegration(getContractDetailsLambda));
    addAuthorizedMethod(contractDetails, 'PUT', new apigateway.LambdaIntegration(updateContractDetailsLambda));

    employees.addResource('search').addMethod('GET', new apigateway.LambdaIntegration(searchEmployeesLambda), {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: authorizer,
    });

    const organization = api.root.addResource('organization');
    const orgParentById = organization.addResource('{id}');

    const department = organization.addResource('department');
    department.addMethod('POST', new apigateway.LambdaIntegration(createDepartmentLambda));
    department.addMethod('GET', new apigateway.LambdaIntegration(listDepartmentLambda));
    department.addResource('async-list').addMethod('GET', new apigateway.LambdaIntegration(getDepartmentsRequestLambda));
    const departmentById = department.addResource('{departmentId}');
    departmentById.addMethod('GET', new apigateway.LambdaIntegration(getDepartmentLambda));

    const position = organization.addResource('position');
    position.addMethod('POST', new apigateway.LambdaIntegration(createPositionLambda));
    position.addMethod('GET', new apigateway.LambdaIntegration(listPositionLambda));
    const positionById = position.addResource('{positionId}');
    positionById.addMethod('GET', new apigateway.LambdaIntegration(getPositionLambda));
    orgParentById.addResource('position-method').addMethod('POST', new apigateway.LambdaIntegration(createPositionMethodLambda));

    const orgUnitCollection = organization.addResource('org-unit');
    orgUnitCollection.addMethod('GET', new apigateway.LambdaIntegration(listOrgUnitLambda));
    const orgUnitById = orgUnitCollection.addResource('{unitId}');
    orgUnitById.addMethod('GET', new apigateway.LambdaIntegration(getOrgUnitLambda));
    orgParentById.addResource('org-unit').addMethod('POST', new apigateway.LambdaIntegration(createOrgUnitLambda));

    const jobClassification = organization.addResource('job-classification');
    jobClassification.addMethod('POST', new apigateway.LambdaIntegration(createJobClassificationLambda));
    jobClassification.addMethod('GET', new apigateway.LambdaIntegration(listJobClassificationLambda));
    const jobClassificationById = jobClassification.addResource('{jobClassificationId}');
    jobClassificationById.addMethod('GET', new apigateway.LambdaIntegration(getJobClassificationLambda));

    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'The ID of the Cognito User Pool',
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'The ID of the Cognito User Pool Client',
    });

    departmentTopic.addSubscription(new subscriptions.SqsSubscription(departmentQueue));
    departmentQueue.grantConsumeMessages(departmentAggregatorLambda);
    departmentAggregatorLambda.addEventSource(new lambdaEventSources.SqsEventSource(departmentQueue));
    departmentTopic.grantPublish(getDepartmentLambda);
    getDepartmentLambda.addEnvironment('DEPARTMENT_TOPIC_ARN', departmentTopic.topicArn);
  }
}

module.exports = { HrCdkStackStack };
