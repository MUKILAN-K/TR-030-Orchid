import json

def generate_demo_payload():
    # Generate the dictionary matching the 17-feature assumption
    demo_tx = {
        "TransactionAmt": 250.0,
        "hour": 3,
        "is_night": 1,
        "is_round_amount": 0
    }
    
    print("📋 Copy and paste this JSON payload to test your API:")
    print("-" * 40)
    print(json.dumps(demo_tx, indent=4))
    print("-" * 40)
    print("\n🚀 Example cURL command:")
    print("""curl -X POST http://localhost:7860/predict \\
     -H "Content-Type: application/json" \\
     -d '{
       "TransactionAmt": 250.0,
       "hour": 3,
       "is_night": 1,
       "is_round_amount": 0
     }'""")

if __name__ == "__main__":
    generate_demo_payload()
