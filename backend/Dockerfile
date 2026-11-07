FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt && useradd --create-home --uid 10001 appuser
COPY backend /app/backend
RUN mkdir /data && chown appuser:appuser /data
USER appuser
ENV DATA_DIR=/data PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
