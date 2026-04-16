# backend/app.py
import gradio as gr
from transformers import pipeline

# Load Pre-Trained Zero-Shot Model (Downloads automatically on first run)
classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")

# Define our 6 Fraud Types + Legitimate
CANDIDATE_LABELS = [
    "legitimate transaction",
    "stolen card usage",
    "account takeover",
    "fake merchant scam",
    "money laundering pattern",
    "identity fraud",
    "behavioral abuse"
]

def predict_fraud(amount, hour, email_domain, device, is_round, merchant_freq):
    """
    Converts transaction details into a natural language description
    and uses Zero-Shot AI to classify it.
    """
    
    # 1. Create a natural language description of the transaction
    time_desc = "at night" if (hour < 6 or hour > 22) else "during the day"
    email_desc = "using a suspicious anonymous email" if email_domain in ["ProtonMail", "TempMail"] else "using a standard email"
    device_desc = f"on a {device} device"
    freq_desc = "with high frequency" if merchant_freq == "High Frequency" else "with low frequency"
    round_desc = "The amount is a round number." if is_round else ""
    
    prompt = f"A transaction of ${amount} occurred {time_desc} {email_desc} {device_desc} {freq_desc}. {round_desc}"
    
    # 2. Run Zero-Shot Classification
    result = classifier(prompt, CANDIDATE_LABELS, multi_label=False)
    
    # 3. Extract Best Match
    best_label = result['labels'][0]
    score = result['scores'][0]
    
    # Map label to clean type name
    type_map = {
        "legitimate transaction": "LEGITIMATE",
        "stolen card usage": "STOLEN_CARD",
        "account takeover": "ACCOUNT_TAKEOVER",
        "fake merchant scam": "FAKE_MERCHANT",
        "money laundering pattern": "MONEY_LAUNDERING",
        "identity fraud": "IDENTITY_FRAUD",
        "behavioral abuse": "BEHAVIORAL_ABUSE"
    }
    
    fraud_type = type_map.get(best_label, "UNKNOWN")
    
    # 4. Format Output
    json_output = {
        "Fraud Score": f"{score:.2f}",
        "Risk Level": "🟢 LOW" if score < 0.5 else "🟡 MEDIUM" if score < 0.8 else "🔴 HIGH",
        "Predicted Type": fraud_type
    }
    
    explanation = f"AI analyzed the pattern: '{prompt}' and classified it as {fraud_type.replace('_', ' ').title()} with {score:.0%} confidence."
    
    return json_output, explanation

# --- GRADIO UI ---
with gr.Blocks() as demo:
    gr.Markdown("# 🛡️ FraudGuard AI - Zero-Shot Detector")
    #gr.Markdown("Uses pre-trained BART model to detect fraud without training.")
    
    with gr.Row():
        with gr.Column():
            inp_amount = gr.Number(label="Amount ($)", value=100)
            inp_hour = gr.Slider(0, 23, step=1, label="Hour", value=12)
            inp_email = gr.Dropdown(["Gmail", "ProtonMail", "TempMail"], label="Email", value="Gmail")
            inp_device = gr.Dropdown(["Windows", "Android", "iOS"], label="Device", value="Windows")
            inp_round = gr.Checkbox(label="Is Round Amount?", value=False)
            inp_freq = gr.Radio(["Low Frequency", "High Frequency"], label="Freq", value="Low Frequency")
            btn = gr.Button("Analyze", variant="primary")
            
        with gr.Column():
            out_json = gr.JSON(label="Result")
            out_text = gr.Textbox(label="Explanation")

    btn.click(predict_fraud, inputs=[inp_amount, inp_hour, inp_email, inp_device, inp_round, inp_freq], outputs=[out_json, out_text])

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)