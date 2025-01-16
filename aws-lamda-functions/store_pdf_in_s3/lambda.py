import boto3
import base64

s3 = boto3.client('s3')
BUCKET_NAME = 'your-s3-bucket-name'  # Replace with your S3 bucket name

def lambda_handler(event, context):
    # Extract file name and file data from the event
    file_name = event.get('fileName')
    base64_data = event.get('fileData')

    if not file_name or not base64_data:
        return {
            'statusCode': 400,
            'body': 'Both fileName and fileData are required'
        }

    # Decode the base64 encoded file data
    try:
        file_data = base64.b64decode(base64_data)
    except Exception as e:
        return {
            'statusCode': 500,
            'body': f'Error decoding base64 file data: {str(e)}'
        }

    # Upload the file to S3
    try:
        response = s3.put_object(
            Bucket=BUCKET_NAME,
            Key=file_name,
            Body=file_data,
            ContentType='application/pdf'  # Adjust this based on your file type
        )
        return {
            'statusCode': 200,
            'body': f'File uploaded successfully: {response}'
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': f'Error uploading file to S3: {str(e)}'
        }
