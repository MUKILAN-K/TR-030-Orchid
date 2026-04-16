from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import gradio as gr
import numpy as np
import os
import torch
from pytorch_tabnet.tab_model import TabNetClassifier
import warnings

warnings.filterwarnings("ignore")

app = FastAPI(title="FraudGuard AI Predictor API")

# --- ML Model Loading ---
# Adjust path to find the model locally or when flattened on HF Space
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
potential_paths = [
    os.path.join(BASE_DIR, '..', 'models', 'tabnet_model.zip'), # Local setup
    os.path.join(BASE_DIR, 'models', 'tabnet_model.zip'),       # Alternative HF structure
    os.path.join(BASE_DIR, 'tabnet_model.zip')                  # Flat HF structure
]

MODEL_PATH = None
for p in potential_paths:
    if os.path.exists(p):
        MODEL_PATH = p
        break

clf = None
if MODEL_PATH:
    try:
        clf = TabNetClassifier()
        clf.load_model(MODEL_PATH)
        print(f"✅ Model Loaded Successfully from {MODEL_PATH}")
    except Exception as e:
        print(f"❌ Failed to load model from {MODEL_PATH}. Error: {e}")
else:
    print(f"❌ Could not locate tabnet_model.zip in any expected paths.")

# --- API Definitions ---
class TransactionRequest(BaseModel):
    TransactionAmt: float
    hour: int
    is_night: int
    is_round_amount: int

def predict_fraud(features_json: dict) -> dict:
    if clf is None:
        raise HTTPException(status_code=500, detail="Model is not loaded.")
        
    try:
        # Map the simple JSON dictionary to a 17-dimensional numpy array 
        # that matches the TabNet model's expected training structure.
        X = np.zeros((1, 17))
        
        amt = features_json.get('TransactionAmt', 0.0)
        hr = features_json.get('hour', 12)
        night = features_json.get('is_night', 0)
        round_amt = features_json.get('is_round_amount', 0)
        
        # 1. Log Amount (Index 0)
        X[0][0] = np.log1p(amt)
        # 2. Transaction Hour (Index 3)
        X[0][3] = hr
        # 3. IsNightTransaction (Index 5)
        X[0][5] = night
        # 4. IsRoundAmount (Index 6)
        X[0][6] = round_amt
        # Note: All other 13 features remain 0 (default) for this demo inference
        
        # Make Prediction
        probas = clf.predict_proba(X)[0]
        fraud_score = float(probas[1])
        
        # Determine Fraud Type
        ftype = "legitimate"
        if fraud_score > 0.7:
            if round_amt == 1: 
                ftype = "fake_merchant"
            elif night == 1: 
                ftype = "stolen_card"
            else: 
                ftype = "behavioral_abuse"
                
        return {
            "fraud_score": fraud_score,
            "fraud_type": ftype
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Prediction error: {str(e)}")

@app.post("/predict")
async def api_predict(req: TransactionRequest):
    return predict_fraud(req.model_dump())

# --- Gradio UI ---
def generate_gradio_output(amt, hr, night):
    feature_dict = {
        "TransactionAmt": amt,
        "hour": hr,
        "is_night": 1 if night else 0,
        "is_round_amount": 1 if amt % 10 == 0 else 0
    }
    
    try:
        result = predict_fraud(feature_dict)
        return result
    except Exception as e:
        return {"error": str(e)}

with gr.Blocks(theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🛡️ FraudGuard AI Predictor")
    gr.Markdown("Test the underlying TabNet model directly.")
    
    with gr.Row():
        with gr.Column(scale=1):
            amt_input = gr.Number(label="Transaction Amount ($)", value=250.0)
            hr_input = gr.Dropdown(choices=list(range(24)), label="Transaction Hour (0-23)", value=14)
            night_input = gr.Checkbox(label="Is Night Transaction? (Between 10PM - 6AM)", value=False)
            btn = gr.Button("Analyze Transaction", variant="primary")
            
        with gr.Column(scale=1):
            json_output = gr.JSON(label="API Output Response")
            
    btn.click(
        fn=generate_gradio_output, 
        inputs=[amt_input, hr_input, night_input],
        outputs=[json_output]
    )

# Mount the Gradio app onto FastAPI
app = gr.mount_gradio_app(app, demo, path="/")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)