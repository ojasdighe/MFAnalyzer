# app.py
from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
from scipy import stats
import yfinance as yf  # For fetching risk-free rate

app = Flask(__name__)

class FundAnalyzer:
    """Class to handle all fund analysis operations"""
    
    def __init__(self, fund_data):
        self.raw_data = fund_data
        self.df = self._preprocess_data()
        self.risk_free_rate = self._get_risk_free_rate()
    
    def _preprocess_data(self):
        """Convert raw JSON data to DataFrame and process timestamps"""
        df = pd.DataFrame(self.raw_data)
        df['timestamp'] = pd.to_datetime(df['timestamp'].apply(lambda x: x['$date']))
        df.sort_values('timestamp', inplace=True)
        df['daily_returns'] = df['nav'].pct_change()
        return df
    
    def _get_risk_free_rate(self):
        """Get current risk-free rate (10-year govt bond yield)"""
        try:
            bond = yf.download('^TNX', period='1d')
            return bond['Close'].iloc[-1]
        except:
            return 4.0  # Default value if unable to fetch
    
    def get_historical_data(self, periods):
        """Get historical NAV data for multiple time periods"""
        end_date = self.df['timestamp'].max()
        historical_data = {}
        
        for period in periods:
            days = period * 30  # Convert months to days
            start_date = end_date - pd.Timedelta(days=days)
            period_data = self.df[self.df['timestamp'] >= start_date]
            historical_data[f'{period}_month'] = {
                'dates': period_data['timestamp'].tolist(),
                'values': period_data['nav'].tolist()
            }
        
        return historical_data
    
    def calculate_absolute_returns(self, start_date, end_date):
        """Calculate absolute returns between two dates"""
        period_data = self.df[(self.df['timestamp'] >= start_date) & 
                            (self.df['timestamp'] <= end_date)]
        if len(period_data) < 2:
            return None
            
        initial_value = period_data['nav'].iloc[0]
        final_value = period_data['nav'].iloc[-1]
        return ((final_value - initial_value) / initial_value) * 100
    
    def calculate_rolling_returns(self, window_months, end_date=None):
        """Calculate rolling returns for specified window"""
        if end_date is None:
            end_date = self.df['timestamp'].max()
            
        window_days = window_months * 30
        start_date = end_date - pd.Timedelta(days=window_days)
        
        period_data = self.df[(self.df['timestamp'] >= start_date) & 
                            (self.df['timestamp'] <= end_date)]
        
        rolling_returns = []
        dates = []
        
        for i in range(len(period_data) - window_days + 1):
            window_slice = period_data.iloc[i:i+window_days]
            ret = self.calculate_absolute_returns(
                window_slice['timestamp'].iloc[0],
                window_slice['timestamp'].iloc[-1]
            )
            if ret is not None:
                rolling_returns.append(ret)
                dates.append(window_slice['timestamp'].iloc[-1])
                
        return pd.Series(rolling_returns, index=dates)
    
    def calculate_cagr(self, years, end_date=None):
        """Calculate CAGR for specified number of years"""
        if end_date is None:
            end_date = self.df['timestamp'].max()
            
        start_date = end_date - pd.Timedelta(days=int(years*365))
        period_data = self.df[(self.df['timestamp'] >= start_date) & 
                            (self.df['timestamp'] <= end_date)]
        
        if len(period_data) < 2:
            return None
            
        initial_value = period_data['nav'].iloc[0]
        final_value = period_data['nav'].iloc[-1]
        
        return (((final_value / initial_value) ** (1/years)) - 1) * 100
    
    def calculate_xirr(self, start_date, end_date, additional_flows=None):
        """Calculate XIRR including any additional cashflows"""
        period_data = self.df[(self.df['timestamp'] >= start_date) & 
                            (self.df['timestamp'] <= end_date)]
        
        if len(period_data) < 2:
            return None
            
        cashflows = [-period_data['nav'].iloc[0]]  # Initial investment
        dates = [period_data['timestamp'].iloc[0]]
        
        # Add any additional cashflows
        if additional_flows:
            for date, amount in additional_flows:
                cashflows.append(amount)
                dates.append(date)
        
        # Add final value
        cashflows.append(period_data['nav'].iloc[-1])
        dates.append(period_data['timestamp'].iloc[-1])
        
        def xnpv(rate):
            return sum([cf/(1+rate)**((d-dates[0]).days/365.0) 
                      for cf, d in zip(cashflows, dates)])
        
        # Newton's method for XIRR calculation
        rate = 0.1
        for _ in range(100):
            new_rate = rate - xnpv(rate)/sum([-cf*d/(1+rate)**(d+1) 
                      for cf, d in zip(cashflows, dates)])
            if abs(new_rate - rate) < 0.0001:
                return new_rate * 100
            rate = new_rate
        
        return None
    
    def calculate_sharpe_ratio(self, window_years=1, end_date=None):
        """Calculate Sharpe Ratio for specified window"""
        if end_date is None:
            end_date = self.df['timestamp'].max()
            
        start_date = end_date - pd.Timedelta(days=int(window_years*365))
        period_data = self.df[(self.df['timestamp'] >= start_date) & 
                            (self.df['timestamp'] <= end_date)]
        
        if len(period_data) < 252:  # Minimum 1 year of data
            return None
            
        excess_returns = period_data['daily_returns'] - self.risk_free_rate/252
        return np.sqrt(252) * (excess_returns.mean() / excess_returns.std())
    
    def get_investment_recommendation(self, metrics):
        """Generate detailed investment recommendation based on multiple metrics"""
        score = 0
        reasons = []
        
        # Sharpe Ratio analysis
        if metrics['sharpe_ratio'] > 1.5:
            score += 3
            reasons.append("Excellent risk-adjusted returns")
        elif metrics['sharpe_ratio'] > 1:
            score += 2
            reasons.append("Good risk-adjusted returns")
        elif metrics['sharpe_ratio'] > 0.5:
            score += 1
            reasons.append("Moderate risk-adjusted returns")
        else:
            reasons.append("Poor risk-adjusted returns")
        
        # CAGR analysis
        if metrics['cagr'] > 15:
            score += 3
            reasons.append("Strong consistent growth")
        elif metrics['cagr'] > 10:
            score += 2
            reasons.append("Good consistent growth")
        elif metrics['cagr'] > 7:
            score += 1
            reasons.append("Moderate growth")
        else:
            reasons.append("Weak growth")
        
        # Rolling Returns analysis
        if metrics['rolling_returns'] > 12:
            score += 2
            reasons.append("Strong periodic performance")
        elif metrics['rolling_returns'] > 8:
            score += 1
            reasons.append("Decent periodic performance")
        else:
            reasons.append("Inconsistent performance")
        
        # XIRR analysis
        if metrics['xirr'] > metrics['cagr']:
            score += 1
            reasons.append("Beneficial investment timing")
        
        # Generate recommendation
        if score >= 7:
            recommendation = "BUY MORE UNITS"
            action_items = [
                "Consider increasing allocation",
                "Look for dips to add units",
                "Maintain SIP if applicable"
            ]
        elif score >= 4:
            recommendation = "CONTINUE HOLDING"
            action_items = [
                "Monitor performance closely",
                "Maintain current investment",
                "Review in 3 months"
            ]
        else:
            recommendation = "EXIT FUND"
            action_items = [
                "Look for better alternatives",
                "Plan systematic withdrawal",
                "Consider tax implications before exit"
            ]
        
        return {
            'recommendation': recommendation,
            'score': score,
            'reasons': reasons,
            'action_items': action_items
        }

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    
    # Load fund data
    with open('fund_data.json', 'r') as f:
        fund_data = json.load(f)
    
    analyzer = FundAnalyzer(fund_data)
    
    # Get historical data for all time periods
    periods = [1, 3, 6, 12, 36, 60]  # months
    historical_data = analyzer.get_historical_data(periods)
    
    # Calculate metrics for user-selected time periods
    metrics = {
        'absolute_returns': analyzer.calculate_absolute_returns(
            start_date=pd.Timestamp(data['startDate']),
            end_date=pd.Timestamp(data['endDate'])
        ),
        'rolling_returns': analyzer.calculate_rolling_returns(
            window_months=data['rollingWindow']
        ).mean(),
        'cagr': analyzer.calculate_cagr(
            years=data['cagrPeriod']
        ),
        'xirr': analyzer.calculate_xirr(
            start_date=pd.Timestamp(data['startDate']),
            end_date=pd.Timestamp(data['endDate']),
            additional_flows=data.get('additionalFlows')
        ),
        'sharpe_ratio': analyzer.calculate_sharpe_ratio(
            window_years=data['sharpePeriod']
        )
    }
    
    recommendation = analyzer.get_investment_recommendation(metrics)
    
    return jsonify({
        'historical_data': historical_data,
        'metrics': metrics,
        'recommendation': recommendation
    })

if __name__ == '__main__':
    app.run(port=8080, debug=True)
