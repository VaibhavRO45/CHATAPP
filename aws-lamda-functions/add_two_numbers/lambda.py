def lambda_handler(event, context):
    # Extract numbers from the event input
    num1 = event.get('num1')
    num2 = event.get('num2')

    # Check if the numbers are provided
    if num1 is None or num2 is None:
        return {
            'statusCode': 400,
            'body': 'Both num1 and num2 are required in the input'
        }

    # Add the two numbers
    result = num1 + num2

    # Return the result
    return {
        'statusCode': 200,
        'body': {'result': result}
    }
