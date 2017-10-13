import React, { Component } from "react";
import PropTypes from "prop-types";
import { AsyncTypeahead, Typeahead } from "react-bootstrap-typeahead";
import { isArraySchema, isObjectSchema, toArray } from "./utils";
import selectn from "selectn";

const DEFAULT_OPTIONS = {
  required: false,
  labelKey: "name",
  minLength: 3,
  placeholder: "Search...",
  ref: "typeahead",
};

function optionToString(fields, separator) {
  return option => {
    return fields
      .map(field => selectn(field, option))
      .filter(fieldVal => fieldVal)
      .reduce((agg, fieldVal, i) => {
        if (i === 0) {
          return fieldVal;
        } else {
          return `${agg}${separator}${fieldVal}`;
        }
      }, "");
  };
}

function mapLabelKey(labelKey) {
  if (Array.isArray(labelKey)) {
    return optionToString(labelKey, " ");
  } else if (
    typeof labelKey === "object" &&
    labelKey.fields &&
    labelKey.separator
  ) {
    let { fields, separator } = labelKey;
    return optionToString(fields, separator);
  }
  return labelKey;
}

function applyLabelKey(obj, labelKey) {
  if (typeof labelKey === "function") {
    return labelKey(obj);
  } else if (typeof labelKey === "string") {
    return obj[labelKey];
  } else {
    return obj;
  }
}

function defaultValue(properties) {
  let defVal = Object.keys(properties).reduce((agg, field) => {
    if (properties[field].default !== undefined) {
      agg[field] = properties[field].default;
    }
    return agg;
  }, {});
  return defVal;
}

function mapEvents(events, { properties, items }, mapping) {
  if (!mapping || mapping === null) {
    return events;
  } else if (typeof mapping === "string") {
    return events.map(event => event[mapping]);
  } else if (typeof mapping === "function") {
    return events.map(event => mapping(event));
  } else if (typeof mapping === "object") {
    let defVal = defaultValue(
      properties
        ? properties
        : items && items.properties ? items.properties : {}
    );
    let mappedEvents = events.map(event => {
      let schemaEvent = Object.keys(mapping).reduce((agg, field) => {
        let eventField = mapping[field];
        agg[field] = selectn(eventField, event);
        return agg;
      }, Object.assign({}, defVal));
      return schemaEvent;
    });

    return mappedEvents;
  }
}

export function mapToSchema(events, schema, mapping) {
  let schemaEvents = mapEvents(events, schema, mapping);
  return isArraySchema(schema) ? schemaEvents : schemaEvents[0];
}

export function mapFromSchema(data, mapping) {
  if (!mapping || mapping === null) {
    return data;
  } else if (typeof mapping === mapping) {
    return { [mapping]: data };
  } else if (typeof mapping === "object") {
    return Object.keys(mapping).reduce((agg, field) => {
      let eventField = mapping[field];
      agg[eventField] = data[field];
      return agg;
    }, {});
  } else {
    return data;
  }
}

function toSelected(formData, schema, mapping, labelKey) {
  let normFormData = formData ? toArray(formData) : [];
  if (isObjectSchema(schema)) {
    return normFormData.map(selected =>
      applyLabelKey(mapFromSchema(selected, mapping), labelKey)
    );
  }
  return normFormData;
}

class BaseTypeaheadField extends Component {
  handleSelectionChange = conf => events => {
    if (events.length > 0) {
      let { mapping, cleanAfterSelection = false } = conf;
      let { schema } = this.props;
      let schemaEvents = mapToSchema(events, schema, mapping);
      this.props.onChange(schemaEvents);
      if (cleanAfterSelection) {
        setTimeout(() => {
          if (this.refs.typeahead) {
            this.refs.typeahead.getInstance().clear();
          }
        }, 0);
      }
    }
  };
}

export class TypeaheadField extends BaseTypeaheadField {
  render() {
    let { uiSchema: { typeahead }, formData, schema } = this.props;

    let labelKey = mapLabelKey(typeahead.labelKey);
    let selected = toSelected(formData, schema, typeahead.mapping, labelKey);

    let typeConf = Object.assign({}, DEFAULT_OPTIONS, typeahead, {
      onChange: this.handleSelectionChange(typeahead),
      labelKey,
      selected,
    });

    return <Typeahead {...typeConf} />;
  }
}

TypeaheadField.propTypes = {
  schema: PropTypes.object.isRequired,
  uiSchema: PropTypes.shape({
    typeahead: PropTypes.shape({
      options: PropTypes.array.isRequired,
      mapping: PropTypes.object,
      cleanAfterSelection: PropTypes.bool,
    }).isRequired,
  }).isRequired,
};

export class AsyncTypeaheadField extends BaseTypeaheadField {
  constructor(props) {
    super(props);

    this.state = {
      options: [],
    };
  }

  handleSearch = query => {
    if (!query) {
      return;
    }

    let {
      uiSchema: {
        asyncTypeahead: {
          url,
          optionsPath,
          search = (url, query) =>
            fetch(`url?query=${query}`).then(res => res.json()),
        },
      },
    } = this.props;

    search(url, query)
      .then(json => (optionsPath ? selectn(optionsPath, json) : json))
      .then(options => this.setState({ options }));
  };

  render() {
    let { schema, uiSchema: { asyncTypeahead }, formData } = this.props;

    let labelKey = mapLabelKey(asyncTypeahead.labelKey);
    let selected = toSelected(
      formData,
      schema,
      asyncTypeahead.mapping,
      labelKey
    );

    let typeConf = Object.assign(DEFAULT_OPTIONS, asyncTypeahead, {
      selected,
      labelKey,
      onChange: this.handleSelectionChange(asyncTypeahead),
      onSearch: this.handleSearch,
      options: this.state.options,
      ref: "typeahead",
    });

    return <AsyncTypeahead {...typeConf} />;
  }
}

AsyncTypeaheadField.propTypes = {
  schema: PropTypes.object.isRequired,
  uiSchema: PropTypes.shape({
    asyncTypeahead: PropTypes.shape({
      url: PropTypes.string.isRequired,
      optionsPath: PropTypes.string,
      mapping: PropTypes.object,
      cleanAfterSelection: PropTypes.bool,
      search: PropTypes.func,
    }).isRequired,
  }),
};