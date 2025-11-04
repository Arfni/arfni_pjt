package pricing

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"
)

//go:embed data/aws-pricing.json
var awsPricingData []byte

var (
	pricingDB   *AWSPricing
	loadOnce    sync.Once
	loadErr     error
)

// LoadPricingDB loads the AWS pricing database from embedded JSON
func LoadPricingDB() (*AWSPricing, error) {
	loadOnce.Do(func() {
		pricingDB = &AWSPricing{}
		loadErr = json.Unmarshal(awsPricingData, pricingDB)
		if loadErr != nil {
			loadErr = fmt.Errorf("failed to parse pricing data: %w", loadErr)
		}
	})

	return pricingDB, loadErr
}

// GetPricingDB returns the loaded pricing database
func GetPricingDB() (*AWSPricing, error) {
	if pricingDB == nil {
		return LoadPricingDB()
	}
	return pricingDB, loadErr
}
