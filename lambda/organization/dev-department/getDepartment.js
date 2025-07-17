const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { decrypt } = require('../../utils/cryptoUtil');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// Clients
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

// Environment
const tableName = process.env.ORGANIZATIONAL_TABLE_NAME;
const topicArn = process.env.DEPARTMENT_TOPIC_ARN;

// Handler
exports.handler = async (event) => {
  const { departmentId } = event.pathParameters;

  console.log(`🔍 Received request to get department ID: ${departmentId}`);

  if (!departmentId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Department ID is required.' }),
    };
  }

  try {
    // 1. Check for enriched view first
    const enrichedRes = await dbClient.send(new GetItemCommand({
      TableName: tableName,
      Key: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: 'ENRICHED_VIEW' }
      }
    }));

    if (enrichedRes.Item) {
      const item = unmarshall(enrichedRes.Item);
      const parsed = JSON.parse(item.data); // ✅ Parse the stringified JSON in `data`

      console.log(`✅ Returning cached enriched view for department ${departmentId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({ department: parsed }),
      };
    }

    // 2. Fallback: Fetch raw department metadata
    console.warn(`⚠️ Enriched view not found for department ${departmentId}, using METADATA`);

    const rawRes = await dbClient.send(new GetItemCommand({
      TableName: tableName,
      Key: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: 'METADATA' }
      }
    }));

    if (!rawRes.Item) {
      console.warn(`❌ Department not found: ${departmentId}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Department not found.' }),
      };
    }

    const data = unmarshall(rawRes.Item);

    const departmentDetails = {
      departmentId: data.departmentId,
      departmentCode: data.departmentCode,
      departmentType: data.departmentType,
      departmentName: decrypt(data.departmentName),
      description: data.description ? decrypt(data.description) : '',
      comments: data.comments ? decrypt(data.comments) : '',
      costCenter: data.costCenter,
      organizationLevel: data.organizationLevel,
      allowSubDepartments: data.allowSubDepartments,
      maximumPositions: data.maximumPositions,
      reportingStructure: data.reportingStructure,
      budgetControl: data.budgetControl,
      departmentManager: data.departmentManager,
      parentDepartment: data.parentDepartment || null,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
    };

    // 3. Publish department change to SNS to trigger enrichment
    try {
      const snsPayload = {
        departmentId: departmentDetails.departmentId,
        timestamp: new Date().toISOString(),
      };

      await snsClient.send(new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(snsPayload),
      }));

      console.log(`📤 Published department ID ${departmentId} to SNS topic`);
    } catch (snsError) {
      console.error(`❌ Failed to publish department ${departmentId} to SNS`, snsError);
    }

    // 4. Return raw department response
    return {
      statusCode: 200,
      body: JSON.stringify({ department: departmentDetails }),
    };

  } catch (err) {
    console.error('❌ Error retrieving department:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal Server Error. Failed to retrieve department details.',
        error: err.message,
      }),
    };
  }
};
