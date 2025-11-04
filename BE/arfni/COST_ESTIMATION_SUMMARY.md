# Cost Estimation System - Summary

## Quick Overview

AWS cost estimation system combining **verified benchmark data** with **AI-powered analysis**.

## System Pipeline (Simple Flow)

```
User Input (YAML + users + traffic)
  → Service Detection (Spring Boot, MySQL, Redis)
  → Benchmark Lookup (verified memory + estimated capacity)
  → Build AI Prompt (include benchmarks + sanity check instructions)
  → OpenAI Analysis (recommend instances with reasonability validation)
  → Cost Calculation (apply AWS pricing)
  → Output (breakdown + recommendations + warnings)
```

## What's Verified vs Estimated

| Component | Status | Source |
|-----------|--------|--------|
| Spring Boot min 2GB heap | VERIFIED | Stack Overflow + official docs |
| MySQL 70-80% buffer pool | VERIFIED | MySQL 8.0 official docs |
| Redis 80% usable memory | VERIFIED | Redis official docs |
| "t3.medium: 150-400 users" | ESTIMATED | Derived from verified data + TechEmpower |
| Data transfer amounts | ESTIMATED | OpenAI estimate with WARNING |

## Key Features

### 1. Benchmark-Based Recommendations
- Memory requirements: VERIFIED from official documentation
- Capacity estimates: Calculated from verified data + performance benchmarks
- Confidence levels: High/Medium/Low clearly labeled

### 2. AI Safety Mechanism
- LLM instructed to validate reasonability of benchmark data
- If data contradicts fundamentals (e.g., 1GB RAM supporting 5GB workload), LLM should reject it
- Example: "Benchmark suggests X, but unreasonable because [reason]. Recommending Y instead."

### 3. Transparent Uncertainty
- Data transfer costs include explicit WARNING
- Estimates clearly marked as estimates, not facts
- Users encouraged to monitor actual usage

## Example Output

```
Input: 300 users, medium traffic, simple deployment

Benchmark Data:
- Spring Boot: min 2GB (VERIFIED), t3.medium supports 150-400 users (ESTIMATED)
- MySQL: min 1GB (VERIFIED), t3.medium supports 200-800 users (ESTIMATED)

LLM Analysis:
"t3.medium provides 4GB RAM for Spring (2GB) + MySQL (1GB) + overhead.
 Benchmark estimates support 150-400 users for Spring, meeting 300 user requirement."

Output:
- EC2: t3.medium ($33.87/month)
- Storage: 100GB gp3 ($8.80/month)
- Data Transfer: 100GB ($12.60/month) with WARNING
- Total: $55.27/month
```

## Safety Test Results

**Test**: Intentionally wrong benchmark (t3.micro: 1000-5000 users)
**Input**: 300 users
**Expected**: LLM should reject t3.micro (only 1GB RAM)
**Result**: PASS - LLM ignored t3.micro, recommended t3.medium with memory calculation
**Conclusion**: Safety mechanism works

## File Structure

```
internal/pricing/
├── data/
│   ├── benchmarks.json           # Verified memory + estimated capacity
│   └── aws_pricing_kr.json       # AWS Seoul region pricing
├── benchmarks.go                 # Detect services, format prompts
├── benchmark_loader.go           # Load embedded benchmark JSON
├── openai.go                     # Build prompts, call OpenAI API
├── estimator.go                  # Calculate costs from recommendations
└── types.go                      # Data structures

Documentation:
├── README_COST_ESTIMATION.md     # Full documentation (English)
├── README_COST_ESTIMATION_ko.md  # Full documentation (Korean)
├── COST_ESTIMATION_SUMMARY.md    # This file (Quick reference)
├── BENCHMARK_RESEARCH.md         # Detailed sources (English)
└── BENCHMARK_RESEARCH_ko.md      # Detailed sources (Korean)
```

## Current Limitations

1. **User count ambiguity**: System assumes concurrent users, not DAU/MAU
2. **Simple mode memory**: No automatic validation (relies on LLM)
3. **Data transfer uncertainty**: High variance, requires actual monitoring
4. **Capacity estimates**: Not directly measured, derived from multiple sources

## Next Steps (Planned)

1. **Prometheus Integration**: Collect actual metrics, compare vs estimates
2. **Memory validation**: Add explicit memory calculation check for simple mode
3. **User clarification**: Ask "concurrent or daily active users?"
4. **Actual usage feedback**: "Initial estimate: $55/month, Actual usage: $42/month"

## Quick Start

```bash
# Simple deployment (all on one EC2)
./arfni-go estimate-cost \
  -f stack.yaml \
  -users 300 \
  -traffic medium \
  -deployment simple

# Production deployment (managed AWS services)
./arfni-go estimate-cost \
  -f stack.yaml \
  -users 1000 \
  -traffic high \
  -deployment production
```

## Key Takeaways

1. **Not 100% accurate**, but transparent about what's verified vs estimated
2. **AI has safety checks** to catch unreasonable benchmark data
3. **Data transfer is uncertain** - always monitor actual usage
4. **Best for initial estimates** - validate with load testing and monitoring
5. **Prometheus integration planned** for actual usage-based optimization
