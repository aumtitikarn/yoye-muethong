pipeline {
    agent any

    environment {
        VPS_HOST = '187.77.143.23'                   // IP ของ VPS
        VPS_USER = 'root'                           // User บน VPS
        APP_DIR  = '/root/yoye-project/yoye-admin'  // Path ของ yoye-admin
        SSH_CRED = 'vps-app-key'                     // Credentials ID ใน Jenkins
    }

    stages {
        stage('Deploy yoye-admin via SSH') {
            steps {
                sshagent(credentials: [SSH_CRED]) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_HOST} "
                            cd ${APP_DIR} && \
                            git pull origin main && \
                            docker compose -f docker-compose.yaml up -d --build && \
                            docker image prune -f
                        "
                    '''
                }
            }
        }
    }

    post {
        success {
            echo '🎉 Deploy yoye-admin สำเร็จแล้ว!'
        }
        failure {
            echo '❌ Deploy ล้มเหลว โปรดเช็ก Log'
        }
    }
}