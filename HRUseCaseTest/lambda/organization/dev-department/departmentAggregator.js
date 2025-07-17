const {DynamoDBClient, 
  QueryCommand,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
} = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { decrypt } = require('../../utils/cryptoUtil');

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const PERSONNEL_TABLE = process.env.PERSONNEL_TABLE_NAME;
const ORGANIZATIONAL_TABLE = process.env.ORGANIZATIONAL_TABLE_NAME;

exports.handler = async (event) => {
  for (const record of event.Records) {
    const snsMessage = JSON.parse(record.body);
    const body = JSON.parse(snsMessage.Message);
    const { departmentId, action } = body;

    // 🔄 Bulk request
    if (action === 'GET_ALL_DEPARTMENTS') {
      console.log('📦 Performing BULK department aggregation');

      const scanRes = await dbClient.send(new ScanCommand({
        TableName: ORGANIZATIONAL_TABLE,
        FilterExpression: 'begins_with(PK, :prefix) AND SK = :meta',
        ExpressionAttributeValues: {
          ':prefix': { S: 'ORG#DEPARTMENT#' },
          ':meta': { S: 'METADATA' },
        },
      }));

      const departments = scanRes.Items.map(item => unmarshall(item));
      for (const dept of departments) {
        await processDepartment(dept.departmentId);
      }

      console.log(`✅ Bulk aggregation complete for ${departments.length} departments`);
      continue; // Move to next SNS record
    }

    // 🔁 Single-department fallback
    if (departmentId) {
      console.log(`📦 Aggregating data for department ID: ${departmentId}`);
      await processDepartment(departmentId);
    }
  }
};

// 🔧 Move core logic to reusable function
async function processDepartment(departmentId) {
  try {
    // 1. Fetch department metadata
    const deptResult = await dbClient.send(new GetItemCommand({
      TableName: ORGANIZATIONAL_TABLE,
      Key: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: 'METADATA' },
      },
    }));

    if (!deptResult.Item) {
      console.warn(`❌ Department not found: ${departmentId}`);
      return;
    }

    const department = unmarshall(deptResult.Item);
    const decryptedDeptName = decrypt(department.departmentName);

    // 2. Fetch department manager details
    let managerInfo = {
      employeeId: department.departmentManager,
      fullName: 'Unknown',
      status: 'Unknown',
    };

    try {
      const managerPersonalRes = await dbClient.send(new GetItemCommand({
        TableName: PERSONNEL_TABLE,
        Key: {
          PK: { S: `EMPLOYEE#${department.departmentManager}` },
          SK: { S: 'SECTION#PERSONAL_DATA' },
        },
      }));

      if (managerPersonalRes.Item) {
        const personal = unmarshall(managerPersonalRes.Item);
        const firstName = personal.firstName ? decrypt(personal.firstName) : '';
        const lastName = personal.lastName ? decrypt(personal.lastName) : '';
        managerInfo.fullName = `${firstName} ${lastName}`.trim();
        managerInfo.status = personal.status || 'Unknown';
      }
    } catch (err) {
      console.error(`⚠️ Failed to fetch manager data for ${department.departmentManager}`, err);
    }

    // 3. Fetch employees in department
    const employeeQuery = await dbClient.send(new QueryCommand({
      TableName: PERSONNEL_TABLE,
      IndexName: 'DepartmentIndex',
      KeyConditionExpression: 'departmentId = :deptId',
      ExpressionAttributeValues: {
        ':deptId': { S: departmentId },
      },
    }));

    const employees = await Promise.all(
      employeeQuery.Items.map(async (emp) => {
        const base = unmarshall(emp);
        const employeeId = base.employeeId || base.PK?.split('#')[1];

        let fullName = 'Unknown';
        let positionName = 'Unknown';

        // 3a. Get personal data
        try {
          const personalRes = await dbClient.send(new GetItemCommand({
            TableName: PERSONNEL_TABLE,
            Key: {
              PK: { S: `EMPLOYEE#${employeeId}` },
              SK: { S: 'SECTION#PERSONAL_DATA' },
            },
          }));

          if (personalRes.Item) {
            const personal = unmarshall(personalRes.Item);
            const firstName = personal.firstName ? decrypt(personal.firstName) : '';
            const lastName = personal.lastName ? decrypt(personal.lastName) : '';
            fullName = `${firstName} ${lastName}`.trim();
          }
        } catch (err) {
          console.error(`⚠️ Failed to fetch personal data for ${employeeId}`, err);
        }

        // 3b. Get contract (role)
        try {
          const contractRes = await dbClient.send(new GetItemCommand({
            TableName: PERSONNEL_TABLE,
            Key: {
              PK: { S: `EMPLOYEE#${employeeId}` },
              SK: { S: 'SECTION#CONTRACT_DETAILS' },
            },
          }));

          if (contractRes.Item) {
            const contract = unmarshall(contractRes.Item);
            positionName = contract.role || 'Unknown';
          }
        } catch (err) {
          console.error(`⚠️ Failed to fetch contract for ${employeeId}`, err);
        }

        return {
          employeeId,
          fullName,
          positionName,
        };
      })
    );

    // 4. Fetch reporting positions
    const positionScanRes = await dbClient.send(new ScanCommand({
      TableName: ORGANIZATIONAL_TABLE,
      FilterExpression: 'begins_with(PK, :posPrefix) AND SK = :meta AND reportsTo = :mgrId',
      ExpressionAttributeValues: {
        ':posPrefix': { S: 'ORG#POSITION#' },
        ':meta': { S: 'METADATA' },
        ':mgrId': { S: department.departmentManager },
      },
    }));

    const reportingPositions = (positionScanRes.Items || []).map(item => {
      const pos = unmarshall(item);
      return {
        positionId: pos.positionId,
        title: pos.positionTitle,
        reportsTo: pos.reportsTo,
      };
    });

    // 5. Store enriched view
    const enrichedView = {
      departmentId,
      departmentName: decryptedDeptName,
      manager: managerInfo,
      reportingPositions,
      employees,
    };

    await dbClient.send(new PutItemCommand({
      TableName: ORGANIZATIONAL_TABLE,
      Item: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: 'ENRICHED_VIEW' },
        data: { S: JSON.stringify(enrichedView) },
        createdAt: { S: new Date().toISOString() },
      },
    }));

    console.log(`✅ Stored enriched view for department ${departmentId}`);
  } catch (err) {
    console.error(`❌ Error processing department ${departmentId}`, err);
  }
}
