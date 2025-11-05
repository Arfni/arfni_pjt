#!/bin/bash
#
# EC2 Instance Metadata Collector for Prometheus Node Exporter
# This script collects EC2 instance information and outputs in Prometheus format
#

TEXTFILE_DIR="/var/lib/node_exporter/textfile_collector"
OUTPUT_FILE="$TEXTFILE_DIR/instance_info.prom"

# Create directory if it doesn't exist
mkdir -p "$TEXTFILE_DIR"

# EC2 Metadata Service endpoint
METADATA_URL="http://169.254.169.254/latest/meta-data"
TOKEN_URL="http://169.254.169.254/latest/api/token"

# Get IMDSv2 token (more secure)
TOKEN=$(curl -s -X PUT "$TOKEN_URL" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null)

# Function to query metadata with token
get_metadata() {
    local path=$1
    if [ -n "$TOKEN" ]; then
        curl -s -H "X-aws-ec2-metadata-token: $TOKEN" "$METADATA_URL/$path" 2>/dev/null
    else
        # Fallback to IMDSv1
        curl -s "$METADATA_URL/$path" 2>/dev/null
    fi
}

# Collect instance information
INSTANCE_TYPE=$(get_metadata "instance-type")
INSTANCE_ID=$(get_metadata "instance-id")
AVAILABILITY_ZONE=$(get_metadata "placement/availability-zone")
REGION=$(echo "$AVAILABILITY_ZONE" | sed 's/[a-z]$//')

# Check if we're running on EC2
if [ -z "$INSTANCE_TYPE" ]; then
    echo "# Not running on EC2 or metadata service unavailable" > "$OUTPUT_FILE"
    echo "ec2_instance_info{instance_type=\"unknown\",instance_id=\"unknown\",region=\"unknown\",az=\"unknown\"} 1" >> "$OUTPUT_FILE"
    exit 0
fi

# Write metrics in Prometheus format
cat > "$OUTPUT_FILE" << EOF
# HELP ec2_instance_info EC2 instance metadata information
# TYPE ec2_instance_info gauge
ec2_instance_info{instance_type="$INSTANCE_TYPE",instance_id="$INSTANCE_ID",region="$REGION",availability_zone="$AVAILABILITY_ZONE"} 1

# HELP ec2_instance_type_info EC2 instance type as a label
# TYPE ec2_instance_type_info gauge
ec2_instance_type_info{type="$INSTANCE_TYPE"} 1
EOF

chmod 644 "$OUTPUT_FILE"
