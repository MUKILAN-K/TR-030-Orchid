# src/model.py
import pandas as pd
import numpy as np
import torch
from pytorch_tabnet.tab_model import TabNetClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
import os

def get_cat_info(df, feature_cols):
    """
    Calculates categorical dimensions and indices for TabNet.
    Returns: cat_dims (list of unique counts), cat_idxs (list of column indices)
    """
    cat_dims = []
    cat_idxs = []
    
    for i, col in enumerate(feature_cols):
        if col.endswith('_enc'):
            n_unique = df[col].nunique()
            cat_dims.append(int(n_unique))
            cat_idxs.append(i)
            
    return cat_dims, cat_idxs

def train_tabnet_model():
    print("🧠 Starting TabNet Training...")
    
    # 🔍 Robust Path Finder for Processed Data
    current_dir = os.path.dirname(os.path.abspath(__file__))
    path1 = os.path.join(current_dir, '..', 'data', 'processed', 'processed_train.csv')
    path2 = os.path.join(current_dir, 'data', 'processed', 'processed_train.csv')
    
    if os.path.exists(path1):
        data_path = path1
    elif os.path.exists(path2):
        data_path = path2
    else:
        raise FileNotFoundError("❌ processed_train.csv not found! Please run features.py first.")
        
    print(f"📂 Loading data from: {data_path}")
    df = pd.read_csv(data_path)
    
    # 2. Separate Features and Labels
    feature_cols = [c for c in df.columns if c not in ['TransactionID', 'isFraud', 'fraud_type']]
    X = df[feature_cols].values
    y = df['isFraud'].values
    
    # 3. Calculate Categorical Dimensions and Indices
    cat_dims, cat_idxs = get_cat_info(df, feature_cols)
    
    print(f"📊 Numerical features: {len(feature_cols) - len(cat_idxs)}")
    print(f"📊 Categorical features (Embeddings): {len(cat_idxs)}")
    
    # 4. Train/Validation Split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # 5. Initialize TabNet Classifier
    clf = TabNetClassifier(
        n_d=64, n_a=64, 
        n_steps=5, 
        gamma=1.5,
        optimizer_fn=torch.optim.Adam,
        optimizer_params=dict(lr=2e-2, weight_decay=1e-5),
        scheduler_params={"step_size": 50, "gamma": 0.9},
        scheduler_fn=torch.optim.lr_scheduler.StepLR,
        cat_dims=cat_dims,   # <--- Required
        cat_idxs=cat_idxs,   # <--- Required
        verbose=1
    )
    
    # 6. Train the Model
    print("🚀 Training... (This may take 1-2 minutes)")
    clf.fit(
        X_train=X_train, y_train=y_train,
        eval_set=[(X_val, y_val)],
        eval_name=['val'],
        eval_metric=['auc'],
        max_epochs=50,
        patience=10,
        batch_size=1024,
        virtual_batch_size=128,
        num_workers=0
    )
    
    # 7. Evaluate
    y_pred_proba = clf.predict_proba(X_val)
    auc = roc_auc_score(y_val, y_pred_proba[:, 1])
    print(f"\n✅ VALIDATION AUC-ROC: {auc:.4f}")
    
    # 8. Save Model
    model_dir = os.path.join(current_dir, '..', 'models')
    os.makedirs(model_dir, exist_ok=True)
    clf.save_model(os.path.join(model_dir, 'tabnet_model'))
    print(f"💾 Model saved to {model_dir}/tabnet_model")
    
    # 9. Generate Predictions for Dashboard
    print("📉 Generating predictions for dashboard...")
    
    # Get predictions for the full dataset
    full_preds = clf.predict_proba(X)
    
    # Create a temporary dataframe with IDs, scores, AND fraud_type from the processed df
    pred_df = pd.DataFrame({
        'TransactionID': df['TransactionID'].values,
        'fraud_score': full_preds[:, 1],
        'fraud_type': df['fraud_type'].values  # <--- CRITICAL: Keep this from processed data
    })
    
    # 🔀 MERGE with Raw Data to get TransactionAmt back
    current_dir = os.path.dirname(os.path.abspath(__file__))
    raw_trans_path = os.path.join(current_dir, 'data', 'raw', 'train_transaction.csv')
    
    if os.path.exists(raw_trans_path):
        df_raw = pd.read_csv(raw_trans_path)
        
        # Ensure TransactionID is integer in both dataframes for proper merging
        df_raw['TransactionID'] = df_raw['TransactionID'].astype(int)
        pred_df['TransactionID'] = pred_df['TransactionID'].astype(int)
        
        # Merge predictions (which has fraud_type) onto raw data
        # Use 'left' join to keep all transactions from raw data
        dashboard_df = pd.merge(df_raw, pred_df, on='TransactionID', how='left')
        
        # Select columns needed for dashboard
        cols_to_save = ['TransactionID', 'TransactionAmt', 'MerchantID', 'addr1', 'P_emaildomain', 
                        'id_31', 'id_30', 'isFraud', 'fraud_type', 'fraud_score']
        
        # Ensure all columns exist before saving
        existing_cols = [c for c in cols_to_save if c in dashboard_df.columns]
        dashboard_df = dashboard_df[existing_cols]
        
        # Fill any missing fraud_type with 'unknown' just in case
        if 'fraud_type' in dashboard_df.columns:
            dashboard_df['fraud_type'] = dashboard_df['fraud_type'].fillna('unknown')
        else:
            # If merge failed completely, add it back from pred_df
            dashboard_df['fraud_type'] = pred_df.set_index('TransactionID').reindex(dashboard_df['TransactionID'])['fraud_type'].values
        
    else:
        # Fallback if raw data isn't found
        dashboard_df = pred_df.copy()
        # Approximate amount if needed
        if 'LogTransactionAmt' in df.columns:
            dashboard_df['TransactionAmt'] = np.exp(df['LogTransactionAmt']) - 1

    # Save Dashboard Data
    output_dir = os.path.join(current_dir, '..', 'outputs')
    os.makedirs(output_dir, exist_ok=True)
    
    dashboard_df.to_csv(os.path.join(output_dir, 'predictions.csv'), index=False)
    print("📄 Dashboard data saved to outputs/predictions.csv")
    print(f"   Columns saved: {list(dashboard_df.columns)}")
    
    # ✅ DEBUG: Verify fraud_type is present
    if 'fraud_type' in dashboard_df.columns:
        print("✅ Sample of saved ")
        print(dashboard_df[['TransactionID', 'fraud_type', 'fraud_score']].head())
    else:
        print("❌ WARNING: 'fraud_type' column is MISSING!")
    
if __name__ == "__main__":
    train_tabnet_model()