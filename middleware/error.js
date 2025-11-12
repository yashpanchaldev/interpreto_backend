const errorHandler = (err, req, res, next) => {
  const status_code = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(status_code);

  const error_response = {
    s: 0,
    m: err.message,
    r: null,
    err: err.stack,
  };

  return res.json(error_response);
};

export { errorHandler };
