#!/bin/bash

export DOCKER_CONTENT_TRUST=0
export IMAGE="ghcr.io/gdainti/saturivia/saturivia"
export TAG="latest"

echo "Pulling latest image: ${IMAGE}:${TAG}"
docker pull ${IMAGE}:${TAG}

echo 'Stopping and removing old services'
docker-compose -f ./docker-compose.prod.yml down --remove-orphans

docker-compose -f ./docker-compose.prod.yml up -d

echo 'Deployment complete!'