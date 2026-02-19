import React, { useState } from 'react';
import { Offcanvas, Button, Form, Accordion, InputGroup, Badge, Row, Col } from 'react-bootstrap';

const ModernSearchBar = () => {
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const searchBarStyle = {
    container: {
      position: 'relative',
      minWidth: '300px',
      maxWidth: '500px',
      margin: '0 auto'
    },
    input: {
      width: '100%',
      padding: '12px 20px 12px 48px',
      borderRadius: '30px',
      border: 'none',
      backgroundColor: searchFocused ? '#ffffff' : '#f8f9fa',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: searchFocused 
        ? '0 4px 12px rgba(74, 108, 247, 0.15)' 
        : '0 2px 6px rgba(0, 0, 0, 0.05)',
      outline: 'none',
      fontSize: '15px',
      color: '#333',
      fontWeight: '400',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)'
    },
    icon: {
      position: 'absolute',
      left: '18px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: searchFocused ? '#4a6cf7' : '#6c757d',
      transition: 'all 0.3s ease',
      fontSize: '16px'
    },
    clearButton: {
      position: 'absolute',
      right: '16px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#6c757d',
      cursor: 'pointer',
      opacity: searchValue ? 1 : 0,
      transition: 'all 0.3s ease'
    }
  };

  return (
    <div className="app-search" style={searchBarStyle.container}>
      <input
        type="text"
        className="form-control"
        placeholder="Search..."
        style={searchBarStyle.input}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
      />
      <i 
        className="fa-solid fa-search" 
        style={searchBarStyle.icon}
      />
      {searchValue && (
        <i 
          className="fa-solid fa-times"
          style={searchBarStyle.clearButton}
          onClick={() => setSearchValue('')}
        />
      )}
    </div>
  );
};

const AdvancedFilterOffcanvas = ({ 
  show, 
  onHide, 
  columns,
  columnFilters,
  setColumnFilters,
  filterOptions,
  dobFilter,
  setdobFilter,
  selectedDisabilityCategories,
  setSelectedDisabilityCategories,
  activeGameType,
  currentColumnFilter,
  setCurrentColumnFilter
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedAccordions, setExpandedAccordions] = useState(new Set());
  const [accordionSearchTerms, setAccordionSearchTerms] = useState({});

  const toggleAccordion = (key) => {
    setExpandedAccordions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleAccordionSearchChange = (key, value) => {
    setAccordionSearchTerms(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSelectFilterChange = (key, value, isChecked) => {
    setColumnFilters(prev => {
      const currentFilters = [...(prev[key] || [])];

      if (value === "All") {
        return {
          ...prev,
          [key]: isChecked ? ["All"] : [],
        };
      } else {
        let newFilters;
        if (isChecked) {
          newFilters = [...currentFilters.filter(v => v !== "All"), value];
        } else {
          newFilters = currentFilters.filter(v => v !== value);
        }

        if (newFilters.length === 0) {
          newFilters = ["All"];
        }

        return {
          ...prev,
          [key]: newFilters,
        };
      }
    });
  };

  const handleTextFilterChange = (key, value) => {
    setColumnFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleClearAllFilters = () => {
    const resetFilters = {};
    Object.keys(columnFilters).forEach((key) => {
      if (filterOptions[key]) {
        resetFilters[key] = ["All"];
      } else {
        resetFilters[key] = "";
      }
    });
    setColumnFilters(resetFilters);
    setdobFilter({ startDate: "", endDate: "" });
    setSelectedDisabilityCategories([]);
    setAccordionSearchTerms({});
  };

  const clearFilter = (key) => {
    if (filterOptions[key]) {
      setColumnFilters(prev => ({
        ...prev,
        [key]: ["All"]
      }));
    } else {
      setColumnFilters(prev => ({
        ...prev,
        [key]: ""
      }));
    }
    handleAccordionSearchChange(key, '');
  };

  const isButtonStyleFilter = (key) => {
    const buttonStyleFilters = [
      'gender',
      'classificationStatus',
      'wheelchair',
      'gameType',
      'competitionParticipated',
      'paymentStatus',
      'uidStatus'
    ];
    return buttonStyleFilters.includes(key);
  };

  const renderFilterControl = (column) => {
    const key = column.key;
    const currentFilter = columnFilters[key];
    const accordionSearchTerm = accordionSearchTerms[key] || '';
    
    if (key === 'dob') {
      return (
        <div className="mb-1">
          <Form.Label className="text-muted small mb-2 fw-medium">Date Range</Form.Label>
          <div className="d-flex gap-2">
            <Form.Control
              type="date"
              value={dobFilter.startDate}
              onChange={(e) => setdobFilter(prev => ({...prev, startDate: e.target.value}))}
              size="sm"
              className="border-0 bg-light rounded-3"
            />
            <Form.Control
              type="date"
              value={dobFilter.endDate}
              onChange={(e) => setdobFilter(prev => ({...prev, endDate: e.target.value}))}
              size="sm"
              className="border-0 bg-light rounded-3"
            />
          </div>
        </div>
      );
    }

    if (filterOptions[key]) {
      const options = filterOptions[key];
      const useButtonStyle = isButtonStyleFilter(key);
      const filteredOptions = options.filter(option => 
        option.toLowerCase().includes(accordionSearchTerm.toLowerCase())
      );
      
      return (
        <div className="mb-1">
          <div className="mb-3">
            <InputGroup size="md">
              <InputGroup.Text className="bg-light border-0">
                <i className="fas fa-search text-muted"></i>
              </InputGroup.Text>
              <Form.Control
                type="text"
                placeholder={`Search ${column.label}...`}
                value={accordionSearchTerm}
                onChange={(e) => handleAccordionSearchChange(key, e.target.value)}
                className="border-0 bg-light rounded-start-2"
              />
              {accordionSearchTerm && (
                <Button 
                  variant="light" 
                  onClick={() => handleAccordionSearchChange(key, '')}
                  className="border-0 rounded-end-2"
                >
                  <i className="fas fa-times text-muted"></i>
                </Button>
              )}
            </InputGroup>
          </div>
          
          <div className="d-flex justify-content-between align-items-center mb-2">
            <Form.Label className="text-muted small fw-medium">{column.label}</Form.Label>
            <Button 
              variant="link" 
              size="sm" 
              onClick={() => clearFilter(key)}
              className="p-0 text-primary text-decoration-none"
            >
              <i className="fa-solid fa-rotate-right me-1"></i>
              Reset
            </Button>
          </div>
          
          {useButtonStyle ? (
            <div className="d-flex flex-wrap gap-2">
              {filteredOptions.map(option => (
                <Button
                  key={`${key}-${option}`}
                  variant={Array.isArray(currentFilter) && currentFilter.includes(option) ? 'primary' : 'outline-secondary'}
                  onClick={() => handleSelectFilterChange(key, option, !(Array.isArray(currentFilter) && currentFilter.includes(option)))}
                  className="rounded-3 text-capitalize"
                  size="sm"
                >
                  {option}
                </Button>
              ))}
            </div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }} className="bg-light rounded-3 p-2">
              <Row className="gx-2">
                {filteredOptions.map(option => (
                  <Col md={6} key={`${key}-${option}`}>
                    <div 
                      className="d-flex align-items-center ps-2 rounded-3 hover-bg-light py-1"
                      onClick={(e) => {
                        if (e.target.tagName !== 'INPUT') {
                          const checkbox = e.currentTarget.querySelector('input[type="checkbox"]');
                          if (checkbox) {
                            checkbox.click();
                          }
                        }
                      }}
                    >
                      <Form.Check
                        type="checkbox"
                        id={`${key}-${option}`}
                        label={option}
                        checked={Array.isArray(currentFilter) && currentFilter.includes(option)}
                        onChange={(e) => handleSelectFilterChange(key, option, e.target.checked)}
                        className="mb-0 flex-grow-1"
                      />
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div className="mb-1">
          <Form.Label className="text-muted small mb-2 fw-medium">{column.label}</Form.Label>
          <InputGroup size="sm">
            <InputGroup.Text className="bg-light border-0">
              <i className="fas fa-search text-muted"></i>
            </InputGroup.Text>
            <Form.Control
              type="text"
              value={typeof currentFilter === 'string' ? currentFilter : ''}
              onChange={(e) => handleTextFilterChange(key, e.target.value)}
              placeholder={`Search ${column.label}`}
              className="border-0 bg-light rounded-start-2"
            />
            <Button 
              variant="light" 
              onClick={() => clearFilter(key)}
              className="border-0 rounded-end-2"
            >
              <i className="fas fa-times text-muted"></i>
            </Button>
          </InputGroup>
        </div>
      );
    }
  };

  const renderColumnFilterView = () => {
    if (!currentColumnFilter) return null;
    
    const column = columns.find(c => c.key === currentColumnFilter);
    if (!column) return null;

    return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h6 className="mb-0 fw-bold d-flex align-items-center">
            <Button 
              variant="link" 
              onClick={() => setCurrentColumnFilter(null)}
              className="p-0 me-2 text-primary"
            >
              <i className="fas fa-arrow-left"></i>
            </Button>
            <span className="text-gradient">{column.label}</span>
          </h6>
          <Button 
            variant="link" 
            onClick={() => clearFilter(column.key)}
            className="p-0 text-primary text-decoration-none"
          >
            <i className="fa-solid fa-rotate-right"></i>
            Reset
          </Button>
        </div>
        
        {renderFilterControl(column)}
      </div>
    );
  };

  const renderMainFilterView = () => {
    const filteredColumns = columns.filter(column => 
      column.key !== 'action' && 
      column.key !== 'sn' && 
      (filterOptions[column.key] || column.key === 'dob')
    );

    const filteredAccordions = filteredColumns.filter(column => 
      column.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h5 className="mb-0 fw-bold text-gradient">Filters</h5>
          <Button 
            variant="link" 
            onClick={handleClearAllFilters}
            className="p-0 text-danger text-decoration-none"
          >
            <i className="fas fa-broom me-1"></i>
            Clear All
          </Button>
        </div>

        <div className="mb-3">
          <InputGroup size="md">
            <InputGroup.Text className="bg-light border-0">
              <i className="fas fa-search text-muted"></i>
            </InputGroup.Text>
            <Form.Control
              type="text"
              placeholder="Search column name for filters..."
              className="border-0 bg-light rounded-start-2"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <Button 
                variant="light" 
                onClick={() => setSearchTerm('')}
                className="border-0 rounded-end-2"
              >
                <i className="fas fa-times text-muted"></i>
              </Button>
            )}
          </InputGroup>
        </div>

        <div className="accordion-container">
          {filteredAccordions.map(column => {
            const isExpanded = expandedAccordions.has(column.key);
            
            return (
              <div key={`accordion-${column.key}`} className="accordion-item mb-3 border-0">
                <div 
                  className="accordion-header d-flex justify-content-between align-items-center p-3 bg-light rounded-3 cursor-pointer shadow-sm"
                  onClick={() => toggleAccordion(column.key)}
                >
                  <div className="d-flex align-items-center">
                    <i className="fas fa-filter me-2 text-primary"></i>
                    <span className="fw-medium">{column.label}</span>
                  </div>
                  {isExpanded ? (
                    <i className="fas fa-chevron-up text-muted"></i>
                  ) : (
                    <i className="fas fa-chevron-down text-muted"></i>
                  )}
                </div>
                
                {isExpanded && (
                  <div className="accordion-content p-3 bg-light rounded-3 shadow-sm mt-2">
                    {renderFilterControl(column)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Offcanvas 
      show={show} 
      onHide={onHide} 
      placement="end"
      style={{ 
        width: '450px',
        height: '100vh',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(255, 255, 255, 0.85)'
      }}
      className="border-0 shadow-lg"
    >
      <Offcanvas.Header closeButton className="border-bottom pb-3">
        <Offcanvas.Title className="fw-bold d-flex align-items-center">
          <i className="fas fa-filter me-2 text-primary"></i>
          <span className="text-gradient">{currentColumnFilter ? 'Column Filter' : 'Advanced Filters'}</span>
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body className="p-4" style={{ overflowY: 'auto', height: 'calc(100vh - 73px)' }}>
        {currentColumnFilter ? renderColumnFilterView() : renderMainFilterView()}
      </Offcanvas.Body>
    </Offcanvas>
  );
};

export default AdvancedFilterOffcanvas;