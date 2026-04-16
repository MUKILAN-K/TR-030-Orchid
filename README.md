# FraudGuard AI - TabNet Fraud Detection API

Deployed TabNet model for real-time fraud scoring. Accepts transaction features, returns fraud probability and type.

## How to use

### Via Gradio UI
Visit this Space in your browser and fill in the fields to test the model prediction visually.

### Via API
You can programmatically evaluate transactions using the FastAPI POST endpoint.

**Endpoint:** `POST /predict`

**Headers:**
`Content-Type: application/json`

**Example Request:**
```bash
curl -X POST "https://<your-username>-fraudguard-tabnet-api.hf.space/predict" \
     -H "Content-Type: application/json" \
     -d '{
           "TransactionAmt": 250.0,
           "hour": 3,
           "is_night": 1,
           "is_round_amount": 0
         }'
```

**Example Response:**
```json
{
  "fraud_score": 0.85,
  "fraud_type": "stolen_card"
}
```

> **Note:** This is for hackathon/demo use only. The feature pipeline expects a simplified subset of the original model inputs for demonstration.
