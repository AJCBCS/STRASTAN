// lambda/organization/dev-position/listPosition.js
exports.handler = async (event) => {
  console.log("listPosition Lambda Invoked:", event);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Lists all position details" })
  };
};
