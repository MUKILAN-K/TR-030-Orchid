# 🛡️ Orchid FraudGuard AI - Zero-Shot Detector

Orchid FraudGuard AI is an innovative fraud detection system that leverages **Zero-Shot Natural Language Classification**. Instead of relying on traditional tabular machine learning (like XGBoost or TabNet) that requires vast amounts of pre-labeled historical data, this model converts transaction metadata into human-readable narratives and determines fraudulent intent using **Facebook's BART-large-mnli** model.

## 🚀 Live Demo

**Test the model in your browser here:**  
🔗 **[Hugging Face Space: Orchid-fraud-detection-model](https://huggingface.co/spaces/mukilan-k/Orhcid-fraud-detection-model)**

## 🧠 How it Works

The system takes incoming transaction parameters (such as amount, hour of day, device, and email provider) and translates them into a descriptive prompt. For example:
> *"A transaction of $250 occurred at night using a suspicious anonymous email on an Android device with high frequency. The amount is a round number."*

This narrative is then fed into the BART Zero-Shot classifier against a strict set of candidate labels:
- `legitimate transaction`
- `stolen card usage`
- `account takeover`
- `fake merchant scam`
- `money laundering pattern`
- `identity fraud`
- `behavioral abuse`

The AI returns a confidence score dictating the Risk Level (🟢 LOW, 🟡 MEDIUM, 🔴 HIGH) along with an automated compliance explanation.

## 💻 Programmatic API Usage

Because this app is hosted on Hugging Face Spaces using Gradio, a programmatic API is automatically generated for it! You can call it from Python or via standard HTTP requests.

### Using Python (`gradio_client`)

First, install the client:
```bash
pip install gradio_client
```

Then, run your inference:
```python
from gradio_client import Client

# Connect to the Hugging Face Space
client = Client("mukilan-k/Orhcid-fraud-detection-model")

# Pass inputs: amount, hour, email, device, is_round, frequency
result = client.predict(
		amount=500,
		hour=3,
		email="ProtonMail",
		device="Android",
		is_round=True,
		merchant_freq="High Frequency",
		api_name="/predict"
)

print(result)
```

### Using cURL (REST API)

You can hit the Gradio API endpoint directly. Note that inputs must be passed in an ordered array inside a `data` key.

```bash
curl -X POST "https://mukilan-k-orhcid-fraud-detection-model.hf.space/call/predict" \
     -H "Content-Type: application/json" \
     -d '{
           "data": [
               500,
               3,
               "ProtonMail",
               "Android",
               true,
               "High Frequency"
           ]
         }'
```

## 📦 Requirements

If you want to run this locally, the requirements are:
- `gradio>=4.0.0`
- `transformers>=4.30.0`
- `torch>=2.0.0`
- `sentencepiece>=0.1.99`
- `accelerate>=0.20.0`

Run locally via:
```bash
python app.py
```
*(The BART model will automatically download on the first run, which may take a few moments depending on your connection speed).*
