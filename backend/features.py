# src/features.py
import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
import os

def engineer_features(df):
    """
    Transforms raw dataframe into a feature matrix for TabNet.
    """
    print("⚙️ Starting Feature Engineering...")
    df = df.copy()
    
    # 🔧 FIX: Convert string dates back to datetime objects
    df['TransactionDate'] = pd.to_datetime(df['TransactionDate'])
    print(f"✅ TransactionDate converted to datetime. Dtype: {df['TransactionDate'].dtype}")
    
    # 1. TIME-BASED FEATURES (Behavioral Abuse & Stolen Card)
    # ---------------------------------------------
    df['TransactionHour'] = df['TransactionDate'].dt.hour
    df['TransactionDay'] = df['TransactionDate'].dt.dayofweek
    
    # Flag night transactions (common in stolen card scenarios)
    df['IsNightTransaction'] = ((df['TransactionHour'] < 6) | (df['TransactionHour'] > 22)).astype(int)
    
    # 2. AMOUNT-BASED FEATURES (Stolen Card & Behavioral Abuse)
    # ---------------------------------------------
    # Log transform to handle skewness (neural networks prefer this)
    df['LogTransactionAmt'] = np.log1p(df['TransactionAmt'])
    
    # Calculate User Average (Simulated - in real data this comes from history)
    # We use 'card1' as the User ID proxy
    user_avg = df.groupby('card1')['TransactionAmt'].transform('mean')
    df['AmtVsUserAvg'] = df['TransactionAmt'] / (user_avg + 1) # Avoid division by zero
    
    # Z-Score: How many standard deviations away from the norm?
    user_std = df.groupby('card1')['TransactionAmt'].transform('std')
    df['AmtZScore'] = (df['TransactionAmt'] - user_avg) / (user_std + 1)
    
    # 3. MERCHANT & LOCATION FEATURES (Fake Merchant & Identity Fraud)
    # ---------------------------------------------
    # Check if amount is a "Round Number" (Fake Merchant indicator)
    df['IsRoundAmount'] = (df['TransactionAmt'] % 10 == 0).astype(int)
    
    # Merchant Frequency (Money Laundering indicator)
    merchant_count = df.groupby('MerchantID')['TransactionID'].transform('count')
    df['MerchantTxCount'] = merchant_count
    
    # 4. IDENTITY & DEVICE FEATURES (Account Takeover & Identity Fraud)
    # ---------------------------------------------
    # Suspicious email domains (Account Takeover indicator)
    suspicious_domains = ['protonmail.com', 'tempmail.com', 'guerrillamail.com']
    df['IsSuspiciousEmail'] = df['P_emaildomain'].isin(suspicious_domains).astype(int)
    
    # Identity Mismatch (Identity Fraud indicator)
    # Compare country of origin vs card country (Simplified logic for synthetic data)
    df['CountryMismatch'] = (df['id_13'] != df['id_19']).astype(int)
    
    # 5. MONEY LAUNDERING SPECIFIC
    # ---------------------------------------------
    # High frequency of transactions per hour
    df['TxPerHour'] = df.groupby(['card1', 'TransactionHour'])['TransactionID'].transform('count')
    df['IsHighFreq'] = (df['TxPerHour'] > 5).astype(int)

    # -------------------------------------------------------
    # PREPROCESSING FOR TABNET
    # -------------------------------------------------------
    
    # A. Define Categorical vs Numerical columns
    # ✅ FIXED: Only use columns that actually exist in your dataset
    cat_cols = [col for col in ['card4', 'P_emaildomain', 'id_31', 'id_30', 'ProductCD', 'MerchantID'] 
                if col in df.columns]
    
    num_cols = [
        'LogTransactionAmt', 'AmtVsUserAvg', 'AmtZScore', 
        'TransactionHour', 'TransactionDay', 'IsNightTransaction',
        'IsRoundAmount', 'MerchantTxCount', 'IsSuspiciousEmail', 
        'CountryMismatch', 'TxPerHour', 'IsHighFreq'
    ]
    
    # B. Fill Missing Values
    df[num_cols] = df[num_cols].fillna(0)
    df[cat_cols] = df[cat_cols].fillna('Unknown')
    
    # C. Encode Categoricals
    encoders = {}
    for col in cat_cols:
        le = LabelEncoder()
        df[col + '_enc'] = le.fit_transform(df[col].astype(str))
        encoders[col] = le
    
    # D. Final Column List
    # We keep the 'enc' columns and the numerical columns
    final_features = num_cols + [c + '_enc' for c in cat_cols]
    
    return df, final_features, encoders

def save_processed_data(df, feature_cols):
    """
    Saves the processed data to be loaded by the model training script
    """
    os.makedirs('data/processed', exist_ok=True)
    
    # Select only relevant columns to save space
    save_cols = feature_cols + ['TransactionID', 'isFraud', 'fraud_type']
    df[save_cols].to_csv('data/processed/processed_train.csv', index=False)
    print(f"✅ Processed data saved to data/processed/processed_train.csv")
    print(f"📊 Features ready: {len(feature_cols)}")

if __name__ == "__main__":
    import os
    
    # 🔍 Smart path finder (works regardless of where you run it from)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    trans_path = os.path.join(current_dir, 'data', 'raw', 'train_transaction.csv')
    identity_path = os.path.join(current_dir, 'data', 'raw', 'train_identity.csv')
    
    print(f"📂 Loading transaction data...")
    df_trans = pd.read_csv(trans_path)
    print(f"✅ Transaction columns: {list(df_trans.columns)}")
    
    print(f"\n📂 Loading identity data...")
    df_identity = pd.read_csv(identity_path)
    print(f"✅ Identity columns: {list(df_identity.columns)}")
    
    print(f"\n🔀 Merging transaction and identity data...")
    df = pd.merge(df_trans, df_identity, on='TransactionID', how='left')
    
    print(f"✅ Merged dataset shape: {df.shape}")
    print(f"   Columns: {list(df.columns)}")
    
    # Check if id_13 exists
    if 'id_13' not in df.columns:
        print("❌ ERROR: 'id_13' not found in merged dataframe!")
        print(f"   Available columns with 'id': {[c for c in df.columns if 'id' in c.lower()]}")
    else:
        print("✅ 'id_13' found!")
    
    df_processed, features, encoders = engineer_features(df)
    save_processed_data(df_processed, features)