## Datawrapper Chart API Access

To access all the information about your Datawrapper chart with the ID `6fAk1`, use the structured API endpoints below (ensure you have an API token with appropriate permissions).

### 1. General Chart Information

- **Endpoint**: [Chart Details](https://api.datawrapper.de/v3/charts/6fAk1)
- **URL**:

  ```
  https://api.datawrapper.de/v3/charts/6fAk1
  ```

  Provides metadata about the chart, including type, title, description, etc.

### 2. Chart Data (JSON)

- **Endpoint**: [Chart Data](https://api.datawrapper.de/v3/charts/6fAk1/data)
- **URL**:

  ```
  https://api.datawrapper.de/v3/charts/6fAk1/data
  ```

  Access the raw data of the chart in JSON format.

### 3. Chart Visual Configurations

- **Endpoint**: [Chart Visual Config](https://api.datawrapper.de/v3/charts/6fAk1/config)
- **URL**:

  ```
  https://api.datawrapper.de/v3/charts/6fAk1/config
  ```

  View configuration settings for the chart’s appearance.

### 4. Export Chart to Various Formats

- **Export PNG/PDF/SVG**:
  - **URL**:

    ```
    https://api.datawrapper.de/v3/charts/6fAk1/export/{format}
    ```

    Replace `{format}` with `png`, `pdf`, or `svg` to get the chart in the desired format.

### 5. Chart Publish Status

- **Endpoint**: [Chart Publish Status](https://api.datawrapper.de/v3/charts/6fAk1/publish)
- **URL**:

  ```
  https://api.datawrapper.de/v3/charts/6fAk1/publish
  ```

  Check if the chart is published and view the public link.

### 6. Download Chart Data as CSV

- **Endpoint**: [Download Data as CSV](https://api.datawrapper.de/v3/charts/6fAk1/data.csv)
- **URL**:

  ```
  https://api.datawrapper.de/v3/charts/6fAk1/data.csv
  ```

  Directly download the data in CSV format.

### Authentication Reminder

Ensure you include the `Authorization` header with your API token in all API requests:

```
Authorization: Bearer YOUR_API_TOKEN
```

Use these links and endpoints to programmatically access different aspects of your chart’s data and metadata. Let me know if you need further assistance with these API calls or handling the returned data!
