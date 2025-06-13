# email-delivery

A Kafka-driven, BullMQ-backed service for sending emails.

## Dependencies

This service depends on kafka-pkg and email-delivery-pkg repositories.

## 1. Kafka messaging

### Topics created by this service

| Name | Mode | Message type | Description |
| - | - | - | - |
| emaildelivery.sendEmail | Consume | CorrelatedRequestDTO\<SendEmailDTO\> | Send email |
| emaildelivery.didSendEmail | Produce | CorrelatedResponseDTO\<DidSendEmailDTO\> | Executed when done sending email |


### SendEmailDTO interface

Check email-delivery-pkg for details.


### DidSendEmailDTO interface

Check email-delivery-pkg for details.


### CorrelatedResponseDTO\<T\> interface

Check kafka-pkg repository for details.


### CorrelatedRequestDTO\<T\> interface

Check kafka-pkg repository for details.
