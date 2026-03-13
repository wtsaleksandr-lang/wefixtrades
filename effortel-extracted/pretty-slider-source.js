


  //29
  function buttonTap(container) {
    // Select all elements with the .slider-main__button-rel class
    const sliderMainElements = container.querySelectorAll('.slider-main__button-rel');

    if (!sliderMainElements.length) return;

    // Add click event listener to each .slider-main__button-rel
    sliderMainElements.forEach(element => {
      element.addEventListener('click', () => {
        // Find the .arrow__bg inside the clicked .slider-main__button-rel
        const arrowBg = element.querySelector('.arrow__bg');

        if (arrowBg) {
          // Animate scale down to 0.9 and back to 1
          gsap.to(arrowBg, { scale: 0.94, duration: 0.15, ease: "power1.out" }) // Scale down
            .then(() => gsap.to(arrowBg, { scale: 1, duration: 0.15, ease: "power1.in" })); // Scale back up
        }
      });
    });
  }  

  //30
  function openSlide(container) {
    const customEaseTwo = CustomEase.create(
      "custom",
      "M0,0 C0.189,0.15 0.182,0.235 0.208,0.327 0.257,0.505 0.243,0.512 0.302,0.655 0.371,0.824 0.454,0.86 0.526,0.913 0.611,0.975 0.734,1 1,1 "
    );

    const slideScales = container.querySelectorAll(".slide-scale"); // Select all .slide-scale elements

    if(!slideScales.length) return;

    slideScales.forEach((slideScale) => {
      const overlay = slideScale.querySelector(".slider__overlay-outter");
      const icon = slideScale.querySelector(".team__question-icon");
      const flexTeamSlide = slideScale.querySelector(".flex__team-slide");
      const bioHider = slideScale.querySelector(".bio__hider");
      const award = slideScale.querySelector(".award__outter");

      let isAnimating = false; // Prevent double-clicks during animation for each element

      slideScale.addEventListener("click", () => {
        if (isAnimating) return;

        isAnimating = true;

        const isOpen = overlay.style.display === "flex";

        // GSAP animations
        const timeline = gsap.timeline({
          onComplete: () => {
            isAnimating = false;
          },
        });

        if (!isOpen) {
          // Open animation
          timeline
            .set(overlay, { display: "flex" }) // Set display:flex before animating opacity
            .to(overlay, { opacity: 1, duration: 0.4, ease: "power2.out" }) // Custom duration and easing
            .to(award, { opacity: 0.8, duration: 0.8, scale: 0.7, y: "-3em", ease: customEaseTwo }, 0) // Custom duration and easing
            .to(icon, { rotate: -135, color: "#68d4e3", duration: 1, ease: customEaseTwo }, 0) // Custom rotation easing
            .to(flexTeamSlide, { gap: "1.5em", duration: 0.6, ease: customEaseTwo }, 0) // Custom gap animation
            .to(bioHider, { height: "auto", duration: 0.6, ease: customEaseTwo }, 0); // Custom height animation
        } else {
          // Close animation
          timeline
            .to(overlay, { opacity: 0, duration: 0.4, ease: "power2.in" })
            .set(overlay, { display: "none" }) // Set display:none after fading out
            .to(award, { opacity: 1, duration: 0.7, scale: 1, y: "-1em", ease: customEaseTwo }, 0) // Custom duration and easing
            .to(icon, { rotate: 0, color: "#5f6f77", duration: 1, ease: customEaseTwo }, 0) // Custom easing
            .to(flexTeamSlide, { gap: "0.5em", duration: 0.6, ease: customEaseTwo }, 0) // Custom gap reset
            .to(bioHider, { height: 0, duration: 0.6, ease: customEaseTwo }, 0); // Custom height reset
        }
      });
    });
  }

  //31
  function mobileBounce(container) {
    // Check for mobile devices (adjust breakpoint if necessary)
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    if (isMobile) {
      // Select all elements with the .button_main class
      const buttonMainElements = container.querySelectorAll('.button_main');

      if(!buttonMainElements.length) return;

      // Add click event listener to each .button_main
      buttonMainElements.forEach(element => {
        element.addEventListener('click', () => {
          // Find the .arrow-wrap inside the clicked .button_main
          const arrowWrap = element.querySelector('.arrow-wrap');

          if (arrowWrap) {
            // Animate scale down to 0.94 and back to 1 with bounce effect
            gsap.to(arrowWrap, { 
              scale: 0.85, 
              duration: 0.15, 
              ease: "power1.out" 
            }).then(() => {
              gsap.to(arrowWrap, { 
                scale: 1, 
                duration: 0.15, 
                ease: "power1.in" 
              });
            });
          }
        });
      });
    }
  }

  //32
  function talentCount(container) {
    if (!container) return;

    // Global animation settings
    const animationSettings = {
      duration: 0.8,
      ease: "power3.inOut",
    };

    // Base triggers configuration
    const baseTriggers = [
      { width: "34%", height: "28%", backgroundColor: "#66E8FA", counterY: "0em", yearY: "0em" },
      { width: "42%", height: "40%", backgroundColor: "#2EF5BD", counterY: "-2em", yearY: "-0.8em" },
      { width: "50%", height: "50%", backgroundColor: "#DCFC4C", counterY: "-4em", yearY: "-1.6em" },
      { width: "65%", height: "65%", backgroundColor: "#F8B430", counterY: "-6em", yearY: "-2.4em" },
      { width: "80%", height: "80%", backgroundColor: "#C38BFB", counterY: "-8em", yearY: "-3.2em" },
      { width: "100%", height: "100%", backgroundColor: "#66E8FA", counterY: "-10em", yearY: "-6em" },
    ];

    // Function to adjust the triggers for mobile
    function getAdjustedTriggers() {
      const mobileBreakpoint = parseInt(
        window.getComputedStyle(document.documentElement).getPropertyValue('--mobile-breakpoint') || "768"
      );

      if (window.innerWidth <= mobileBreakpoint) { 
        return baseTriggers.map((trigger) => ({
          ...trigger,
          width: "100%",
        }));
      }
      return baseTriggers;
    }

    // Select relevant elements
    const expandingWrapper = container.querySelector(".expanding__wrapper");
    const counterTrack = container.querySelector(".talent__counter-track");
    const yearTrack = container.querySelector(".talent__year-track");
    const children = container.querySelectorAll(".flex-talent-count > *");
    const teamSubtitle = container.querySelector(".team-subtitle-hide");

    if (!expandingWrapper || !counterTrack || !yearTrack || children.length === 0 || !teamSubtitle) return;

    // Set initial state for teamSubtitle
    gsap.set(teamSubtitle, { paddingTop: "1em" });

    // Reusable function to animate elements
    function animateElement(target, properties) {
      if (!target) return;
      gsap.to(target, { ...animationSettings, ...properties });
    }

    // Local triggers array
    let triggers = [];

    // Initialize ScrollTriggers
    function initScrollTriggers() {
      triggers.forEach((t) => t.kill()); // Kill local triggers
      triggers = []; // Reset array

      const triggersConfig = getAdjustedTriggers();

      children.forEach((child, index) => {
        const trigger = ScrollTrigger.create({
          trigger: child,
          start: "top 70%",
          end: "bottom top",
          onEnter: () => {
            if (index === 0) {
              animateElement(teamSubtitle, { paddingTop: "0", delay: 0.3, duration: 0.6 });
            }

            animateElement(expandingWrapper, {
              width: triggersConfig[index]?.width,
              height: triggersConfig[index]?.height,
              backgroundColor: triggersConfig[index]?.backgroundColor,
            });
            animateElement(counterTrack, { y: triggersConfig[index]?.counterY });
            animateElement(yearTrack, { y: triggersConfig[index]?.yearY });
          },
          onLeaveBack: () => {
            if (index === 0) {
              animateElement(teamSubtitle, { paddingTop: "1em" });
              animateElement(expandingWrapper, {
                width: "0%",
                height: "0%",
                backgroundColor: "rgba(0, 0, 0, 0)", // Smooth transparency
              });
              animateElement(yearTrack, { y: "2em" });
            } else {
              const previousIndex = index > 0 ? index - 1 : 0;
              animateElement(expandingWrapper, {
                width: triggersConfig[previousIndex]?.width,
                height: triggersConfig[previousIndex]?.height,
                backgroundColor: triggersConfig[previousIndex]?.backgroundColor,
              });
              animateElement(counterTrack, { y: triggersConfig[previousIndex]?.counterY });
              animateElement(yearTrack, { y: triggersConfig[previousIndex]?.yearY });
            }
          },
        });

        triggers.push(trigger);
      });
    }

    // Debounced resize event for performance
    let resizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        initScrollTriggers();
      }, 150);
    });

    // Initialize ScrollTriggers
    initScrollTriggers();
  }


  //33
  function graph(container) {
    // Check if elements exist before animating
    if (document.querySelector(".pillar-inner") && document.querySelector(".revolution__wrapper")) {
      gsap.fromTo(
        ".pillar-inner",
        { height: "0%" },
        {
          height: "100%",
          duration: 1.4,
          stagger: {
            each: 0.05,
            from: "end",
          },
          ease: "power4.inOut",
          scrollTrigger: {
            trigger: ".revolution__wrapper",
            start: "top 80%",
          },
        }
      );
    }

    if (document.querySelector(".revolution__metric") && document.querySelector(".revolution__wrapper")) {
      gsap.to(".revolution__metric", {
        y: "-0.5em",
        duration: 1.3,
        delay: 0.8,
        ease: "power4.out",
        scrollTrigger: {
          trigger: ".revolution__wrapper",
          start: "top 80%",
        },
      });
    }
  }


  //34
  function keyInsights(container) {
    if (!container) return;

    // Utility to check if the viewport width is mobile
    const isMobile = () => window.innerWidth <= 768;

    // Apply animation to each .insights-card
    container.querySelectorAll(".insights-card").forEach((card) => {
      // Create a ScrollTrigger for each card
      ScrollTrigger.create({
        trigger: card, // The trigger element
        start: "top 55%", // Start when the top of the card reaches the center of the viewport
        //markers: true, // Uncomment if debugging is needed
        onEnter: () => {
          // Combine animations for all child elements
          gsap.timeline()
            .to(card.querySelector(".key__graph"), {
            height: "100%",
            duration: 1.2,
            ease: "power4.out",
          })
            .to(card.querySelector(".key__number__wrap"), {
            y: "0%",
            duration: 1.2,
            ease: "power4.out",
          }, "<")
            .to(card.querySelector(".key__number"), {
            rotateZ: "0deg",
            duration: 1.2,
            ease: "power4.out",
          }, "<")
            .to(card.querySelector(".key__arrow-wrap"), {
            y: "0%",
            duration: 1.2,
            ease: "power4.out",
          }, "<");
        },
      });

      // Handle open/close toggling for description
      const moreInfoBtn = card.querySelector(".key__more-info");
      const closeBtn = card.querySelector(".key__close-wrap");
      const description = card.querySelector(".key__description");
      const descriptionText = card.querySelector(".key__description-text");

      let isOpen = false; // Track open state

      const openDescription = () => {
        gsap.set(description, { display: "flex" }); // Ensure description is visible

        // Animate description and its elements
        gsap.timeline()
          .to(card.querySelector(".key_metric"), {
          y: "0em", // Move to original position
          duration: 0.35,
          ease: "power3.out",
        }) // Starts at the very beginning
          .to(description, {
          opacity: 1,
          duration: 0.5,
          ease: "power3.out",
        }, "<") // Start at the same time as .key_metric
          .to(descriptionText, {
          y: "0em",
          duration: 0.5,
          ease: "power3.out",
        }, "<") // Start at the same time as the previous animation
          .to(closeBtn, {
          opacity: 1,
          duration: 0.5,
          y: "-2em",
          rotateZ: "0deg",
          ease: "power3.out",
        },"<"); // Start slightly before the previous animation ends

        isOpen = true;
      };

      const closeDescription = () => {
        gsap.timeline()
          .to(card.querySelector(".key_metric"), {
          y: "1.5em", // Move back to 1.5em
          duration: 0.5,
          ease: "power3.in",
        }) // Starts at the very beginning
          .to(description, {
          opacity: 0,
          duration: 0.5,
          ease: "power3.out",
          onComplete: () => {
            gsap.set(description, { display: "none" }); // Hide after animation
          },
        }, "<") // Start at the same time as .key_metric
          .to(descriptionText, {
          y: "2em",
          duration: 0.5,
          ease: "power3.out",
        }, "<")
          .to(closeBtn, {
          opacity: 0,
          duration: 0.5,
          y: "1.5em",
          rotateZ: "-45deg",
          ease: "power3.out",
        }, "<"); // Start at the same time as the previous animation

        isOpen = false;
      };

      // Add event listeners for toggling the description
      if (moreInfoBtn) {
        moreInfoBtn.addEventListener("click", () => {
          if (isMobile() && !isOpen) {
            openDescription();
          }
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          if (isMobile() && isOpen) {
            closeDescription();
          }
        });
      }
    });
  }

  //35
  function filterMobile(container) {
    if (window.matchMedia('(max-width: 768px)').matches) {
      container.querySelectorAll('.resource__filter_outter').forEach(outter => {
        const button = outter.querySelector('.resource__filter-button');
        const filterWrap = outter.querySelector('.resource__filter-wrap');

        // Initial setup to ensure it's collapsible
        filterWrap.style.overflow = 'hidden';
        filterWrap.style.height = '0'; // Start collapsed
        filterWrap.dataset.expanded = 'false'; // Track state

        // Add click event listener to the button
        button.addEventListener('click', () => {
          const isExpanded = filterWrap.dataset.expanded === 'true';

          if (isExpanded) {
            // Collapse the element
            gsap.to(filterWrap, {
              height: 0,
              duration: 0.7,
              ease: 'power3.inOut',
              onComplete: () => {
                filterWrap.dataset.expanded = 'false';
              }
            });
          } else {
            // Expand the element
            const fullHeight = filterWrap.scrollHeight; // Get the full height dynamically
            gsap.to(filterWrap, {
              height: fullHeight,
              duration: 0.7,
              ease: 'power3.inOut',
              onComplete: () => {
                filterWrap.style.height = 'auto'; // Reset height to auto after animation
                filterWrap.dataset.expanded = 'true';
              }
            });
          }
        });
      });
    }
  } 

  //36
  function shareResource(container) {
    // Select all .url__btn elements
    const urlBtns = container.querySelectorAll('.url__btn');

    // Add event listeners to each .url__btn
    urlBtns.forEach((urlBtn) => {
      urlBtn.addEventListener('click', () => {
        // Find the .share__move-track inside the clicked .url__btn
        const shareMoveTrack = urlBtn.querySelector('.share__move-track');

        if (shareMoveTrack) {
          // Animate the movement with GSAP
          gsap.timeline()
            .to(shareMoveTrack, { y: "-50%", duration: 0.5, ease: "power4.inOut" }) // Move up
            .to(shareMoveTrack, { y: "0%", duration: 0.5, ease: "power4.inOut", delay: 2 }); // Move back after 3 seconds
        }
      });
    });

    // Select all .share__links elements
    const shareLinks = container.querySelectorAll('.share__links');

    // Add event listeners to each .share__links
    shareLinks.forEach((link) => {
      link.addEventListener('click', () => {
        // Find the .share__move-track inside the clicked .share__links
        const shareMoveTrack = link.querySelector('.share__move-track');
        // Find the parent .share__buttons-wrap
        const shareButtonsWrap = link.closest('.share__buttons-wrap'); // Adjusted to match new structure

        if (shareMoveTrack && shareButtonsWrap) {
          // Check if it's already toggled (has a specific class, e.g., "active")
          const isActive = shareButtonsWrap.classList.contains('active');

          // Toggle the class
          shareButtonsWrap.classList.toggle('active');

          // Create a GSAP timeline for the animation
          const tl = gsap.timeline();

          if (isActive) {
            // Animate back to the original state
            tl.to(shareMoveTrack, { y: "0%", duration: 0.5, ease: "power2.inOut" }) // Move back
              .to(shareButtonsWrap, { width: "2.5em", duration: 0.5, ease: "power2.inOut" }, 0); // Shrink width
          } else {
            // Animate to the toggled state
            tl.to(shareMoveTrack, { y: "-50%", duration: 0.5, ease: "power2.inOut" }) // Move up
              .to(shareButtonsWrap, { width: "10.5em", duration: 0.5, ease: "power2.inOut" }, 0); // Expand width
          }
        }
      });
    });
  }

  //37
  function resetHubSpot(container) {
    let blockedDomains = [];
    fetch('https://hubspotonwebflow.com/assets/js/blockedDomains.json')
      .then(response => response.json())
      .then(data => {
      blockedDomains = data;
    })
      .catch(error => console.error('Error:', error));

    const updateFormData = (formData) => {
      for (let [name, value] of formData.entries()) {
        switch (name) {
          case "hutk":
            const cookies = document.cookie.split(";");
            const cookieMap = {};

            cookies.forEach((cookie) => {
              const [name, value] = cookie.trim().split("=");
              cookieMap[name] = value;
            });

            const hubspotCookie = cookieMap["hubspotutk"];
            if (hubspotCookie) {
              formData.set(name, hubspotCookie);
            }
            break;
          case "pageUri":
            formData.set(name, window.location.href);
            break;
          case "pageName":
            formData.set(name, document.title);
            break;
          case "pageId":
            formData.set(name, window.location.pathname);
            break;
          default:
            break;
        }
      }
      return formData;
    }

    const webflowHubSpotForms = container.querySelectorAll("[data-wf-hs-form]");
    if (webflowHubSpotForms.length > 0) {
      webflowHubSpotForms.forEach(async (form) => {
        const actionUrl = new URL(form.action);
        const pathParts = actionUrl.pathname.split('/');
        const id = pathParts[pathParts.length - 1];
        let blockList = false;

        await fetch(`https://hubspotonwebflow.com/api/forms/blockList?id=${id}`)
          .then(response => response.json())
          .then(data => {
          blockList = data;
        })
          .catch(error => console.error('Error:', error));

        let isBlocked = false;
        const submitButton = form.querySelector('input[type="submit"], button[type="submit"]');
        if(blockList && blockList.enabled) {
          let additionalBlockedDomains = [];
          if(blockList.additionalBlockedDomains && Array.isArray(blockList.additionalBlockedDomains) && blockList.additionalBlockedDomains.length > 0) {
            additionalBlockedDomains = blockList.additionalBlockedDomains;
            blockedDomains.push(...additionalBlockedDomains);
          }
          const emailInputs = form.querySelectorAll('input[type="email"]');
          emailInputs.forEach((input) => {
            input.addEventListener('input', () => {
              const email = input.value;
              const emailDomain = email.split('@')[1];

              const warningMessage = container.createElement('p');
              warningMessage.style.color = 'red';
              warningMessage.style.marginTop = '1rem';
              warningMessage.style.marginBottom = '1rem';
              warningMessage.style.fontSize = '1rem';
              warningMessage.style.display = 'none';
              const existingWarningMessage = input.parentNode.querySelector('.warning-message');
              if (blockedDomains.includes(emailDomain)) {
                isBlocked = true;
                submitButton.disabled = true;
                submitButton.style.cursor = 'not-allowed';
                submitButton.style.backgroundColor = 'grey';
                warningMessage.className = 'warning-message';
                warningMessage.textContent = 'This email domain is blocked. Please enter a different email.';
                warningMessage.style.display = 'block';
                if (existingWarningMessage) {
                  input.parentNode.removeChild(existingWarningMessage);
                }

                input.parentNode.appendChild(warningMessage);
              } else {
                isBlocked = false;
                submitButton.disabled = false;
                submitButton.style.cursor = '';
                submitButton.style.backgroundColor = '';
                if(existingWarningMessage) {
                  input.parentNode.removeChild(existingWarningMessage);
                }
              }
            });
          });
        }

        const checkboxes = form.querySelectorAll('input[type="checkbox"][required]');
        const checkboxMap = {};
        checkboxes.forEach((checkbox) => {
          const name = checkbox.name;

          if (!checkboxMap[name]) {
            checkboxMap[name] = [];
          }

          checkboxMap[name].push(checkbox);
        });

        let isCheckboxValidationFailed = false;
        Object.values(checkboxMap).forEach((checkboxes) => {
          if (checkboxes.length > 1) {
            const errorMessage = container.createElement('div');
            errorMessage.textContent = 'At least one checkbox must be checked.';
            errorMessage.style.color = 'red';
            errorMessage.style.display = 'none';
            errorMessage.style.marginTop = '1rem';
            errorMessage.style.marginBottom = '1rem';
            errorMessage.style.fontSize = '1rem';
            checkboxes.forEach((checkbox) => {
              checkbox.required = false;

              checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                  errorMessage.style.display = 'none';
                  isCheckboxValidationFailed = false;
                }
              });
            });

            const form = checkboxes[0].form;
            form.appendChild(errorMessage);

            form.addEventListener('submit', (event) => {
              const isChecked = checkboxes.some((checkbox) => checkbox.checked);
              if (!isChecked) {
                event.preventDefault();
                errorMessage.style.display = 'block';
                isCheckboxValidationFailed = true;
              } else {
                errorMessage.style.display = 'none';
                isCheckboxValidationFailed = false;
              }
            });
          }
        });

        form.addEventListener("submit", (event) => {
          if (isCheckboxValidationFailed) {
            return;
          }

          event.preventDefault();
          let formData = new FormData(form);
          formData = updateFormData(formData);

          fetch(form.action, {
            method: form.method,
            body: formData,
          })
            .then((response) => response.json())
            .then((data) => {
            if ("redirectUri" in data) {
              window.location.href = data.redirectUri;
            }

            if ("inlineMessage" in data) {
              const message = container.createElement("div");
              message.style.marginTop = "1rem";
              message.style.marginBottom = "1rem";
              message.innerHTML = data.inlineMessage;
              form.appendChild(message);
              message.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          })
            .catch((error) => console.error(error));
        });
      });
    }

    const webflowForms = container.querySelectorAll(
      "[data-webflow-hubspot-api-form-url]"
    );
    if (webflowForms.length > 0) {
      webflowForms.forEach(async (form) => {
        const actionUrl = new URL(form.dataset.webflowHubspotApiFormUrl);
        const pathParts = actionUrl.pathname.split('/');
        const id = pathParts[pathParts.length - 1];
        let blockList = false;

        await fetch(`https://hubspotonwebflow.com/api/forms/blockList?id=${id}`)
          .then(response => response.json())
          .then(data => {
          blockList = data;
        })
          .catch(error => console.error('Error:', error));

        let isBlocked = false;
        const submitButton = form.querySelector('input[type="submit"], button[type="submit"]');
        if(blockList && blockList.enabled) {
          let additionalBlockedDomains = [];
          if(blockList.additionalBlockedDomains && Array.isArray(blockList.additionalBlockedDomains) && blockList.additionalBlockedDomains.length > 0) {
            additionalBlockedDomains = blockList.additionalBlockedDomains;
            blockedDomains.push(...additionalBlockedDomains);
          }
          const emailInputs = form.querySelectorAll('input[type="email"]');
          emailInputs.forEach((input) => {
            input.addEventListener('input', () => {
              const email = input.value;
              const emailDomain = email.split('@')[1];

              const warningMessage = container.createElement('p');
              warningMessage.style.color = 'red';
              warningMessage.style.marginTop = '1rem';
              warningMessage.style.marginBottom = '1rem';
              warningMessage.style.fontSize = '1rem';
              warningMessage.style.display = 'none';
              const existingWarningMessage = input.parentNode.querySelector('.warning-message');
              if (blockedDomains.includes(emailDomain)) {
                isBlocked = true;
                submitButton.disabled = true;
                submitButton.style.cursor = 'not-allowed';
                submitButton.style.backgroundColor = 'grey';
                warningMessage.className = 'warning-message';
                warningMessage.textContent = 'This email domain is blocked. Please enter a different email.';
                warningMessage.style.display = 'block';
                if (existingWarningMessage) {
                  input.parentNode.removeChild(existingWarningMessage);
                }

                input.parentNode.appendChild(warningMessage);
              } else {
                isBlocked = false;
                submitButton.disabled = false;
                submitButton.style.cursor = '';
                submitButton.style.backgroundColor = '';
                if(existingWarningMessage) {
                  input.parentNode.removeChild(existingWarningMessage);
                }
              }
            });
          });
        }

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          let formData = new FormData(form);
          formData = updateFormData(formData);
          form.querySelectorAll("[data-wfhsfieldname]").forEach((field) => {
            if (field.type === "file") {
              formData.set(field.dataset.wfhsfieldname, field.files[0]);
            } else if(field.type === 'checkbox') {
              if(field.checked) {
                formData.set(field.dataset.wfhsfieldname, field.value);
              }
            } else if(field.type === 'radio') {
              if(field.checked) {
                formData.set(field.dataset.wfhsfieldname, field.value);
              }
            } else {
              formData.set(field.dataset.wfhsfieldname, field.value);
            }
            // formData.delete(field.name);
          });

          fetch(form.dataset.webflowHubspotApiFormUrl, {
            method: "POST",
            body: formData,
          })
            .then((response) => response.json())
            .catch((error) => console.error(error));
        });
      });
    }
  }



  //38
  function dynamicAccordion(container) {
    const customEaseTwo = CustomEase.create(
      "custom",
      "M0,0 C0.189,0.15 0.182,0.235 0.208,0.327 0.257,0.505 0.243,0.512 0.302,0.655 0.371,0.824 0.454,0.86 0.526,0.913 0.611,0.975 0.734,1 1,1 "
    );

    const accordion = container.querySelector('.dynamic__accordion');
    if (!accordion) return;

    const columns = accordion.querySelectorAll('.col-dynamic');
    let isAnimating = false;
    let timer;
    let activeIndex = 0;

    const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

    const startAutoCycle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        activeIndex = (activeIndex + 1) % columns.length;
        columns[activeIndex].click();
        startAutoCycle();
      }, 8000);
    };

    const setInitialStyles = () => {
      columns.forEach((column, index) => {
        if (column.classList.contains('active')) {
          activeIndex = index;
          gsap.set(column, isMobile() ? { height: '25em', width: '100%' } : { width: '60%' });
          gsap.set(column.querySelector('.dynamic__heading'), { opacity: 1, y: 0 });
          gsap.set(column.querySelector('.card__visual-wrap.is-dynamic'), { opacity: 1, y: 0 });
          gsap.set(column.querySelector('p'), { opacity: 1, y: 0 });
          gsap.set(column.querySelector('.dynamic-dot'), { opacity: 1 });
          gsap.set(column.querySelector('.dynamic__icon-holder'), { rotation: -135, y: '4em', opacity:0, });
        } else {
          gsap.set(column, isMobile() ? { height: '4.5em', width: '100%' } : { width: '20%' });
          gsap.set(column.querySelector('.dynamic__heading'), { opacity: 0.6, y: 0 });
          gsap.set(column.querySelector('.card__visual-wrap.is-dynamic'), { opacity: 0, y: "2em" });
          gsap.set(column.querySelector('p'), { opacity: 0, y: "1em" });
          gsap.set(column.querySelector('.dynamic-dot'), { opacity: 0 });
          gsap.set(column.querySelector('.dynamic__icon-holder'), { rotation: 0, y: 0, opacity:1, });
        }
      });
    };

    columns.forEach((column, index) => {
      column.addEventListener('click', () => {
        if (isAnimating) return;

        if (!column.classList.contains('active')) {
          isAnimating = true;
          activeIndex = index;
          startAutoCycle();

          columns.forEach((col) => {
            if (col.classList.contains('active')) {
              gsap.to(col, isMobile() ? { height: '4.5em', duration: 0.8, ease: customEaseTwo } : { width: '20%', duration: 0.8, ease: customEaseTwo });
              gsap.to(col.querySelector('p'), { opacity: 0, y: "1em", duration: 0.6, ease: 'power3.inOut' });
              gsap.to(col.querySelector('.dynamic__heading'), { opacity: 0.6, y: 0, duration: 0.5, delay: 0.4, ease: 'power3.Out' });
              gsap.to(col.querySelector('.card__visual-wrap.is-dynamic'), { opacity: 0, y: "2em", duration: 0.2, ease: 'power3.Out' });
              gsap.to(col.querySelector('.dynamic-dot'), { opacity: 0, duration: 0.5, ease: 'power1.Out' });
              gsap.to(col.querySelector('.dynamic__icon-holder'), {
                rotation: 0,
                y: 0,
                opacity:1,
                duration: 1.3,
                delay: 0.2,              
                ease: customEaseTwo
              });
              col.classList.remove('active');
            }
          });

          column.classList.add('active');
          gsap.to(column, isMobile() ? { height: '25em', duration: 0.8, ease: customEaseTwo } : { width: '60%', duration: 0.8, ease: customEaseTwo });
          gsap.to(column.querySelector('p'), { opacity: 1, y: 0, duration: 0.5, delay: 0.4, ease: 'power3.Out' });
          gsap.to(column.querySelector('.dynamic__heading'), { opacity: 1, y: 0, duration: 0.5, delay: 0.4, ease: 'power3.Out' });
          gsap.to(column.querySelector('.card__visual-wrap.is-dynamic'), { opacity: 1, y: 0, duration: 0.5, delay: 0.4, ease: 'power3.Out' });
          gsap.to(column.querySelector('.dynamic-dot'), { opacity: 1, duration: 0.6, delay: 0.3, ease: 'power3.inOut' });
          gsap.to(column.querySelector('.dynamic__icon-holder'), {
            rotation: -135,
            y: '4em',
            opacity:0,
            duration: 0.8,
            ease: customEaseTwo,
            onComplete: () => {
              isAnimating = false;
            }
          });
        }
      });
    });

    setInitialStyles();
    startAutoCycle();

    // Reapply styles on window resize
    window.addEventListener('resize', setInitialStyles);
  }



  //39
  function prettySlider(container) {
    const prettyButtonsWrap = container.querySelector('.pretty__buttons-wrap');
    if (!prettyButtonsWrap) return; // Exit if the container doesn't have the required element

    const buttons = prettyButtonsWrap.querySelectorAll('.pretty__button-outter');
    let activeIndex = 0;
    let autoCycleInterval;
    let isTransitioning = false; // Flag to prevent interaction during transition
    let timelineAnimation; // To keep reference of the timeline GSAP animation
    let opacityAnimation; // To handle opacity animation

    // Function to update active class and animate timeline and content
    function updateActiveButton() {
      buttons.forEach((button, index) => {
        const timeline = button.querySelector('.pretty__time-line');
        const contentWrap = button.querySelector('.pretty__content-wrap');
        const contentChildren = contentWrap ? contentWrap.children : [];

        if (index === activeIndex) {
          button.classList.add('active');
          gsap.killTweensOf(timeline); // Kill any ongoing animations for this timeline
          gsap.set(timeline, { width: '0%', opacity: 1 }); // Ensure timeline starts fresh

          timelineAnimation = gsap.to(timeline, {
            width: '100%',
            duration: 8, // 8 seconds per cycle
            ease: 'linear',
            onComplete: () => {
              gsap.set(timeline, { width: '0%' });
              activeIndex = (activeIndex + 1) % buttons.length;
              updateActiveButton();
            },
          });

          // Fade out opacity 0.1s before the end of animation
          opacityAnimation = gsap.to(timeline, {
            opacity: 0,
            delay: 7.9,
            duration: 0.1,
            ease: 'power1.out',
          });

          // Animate content children in with delay
          gsap.set(contentChildren, { y: '1em', opacity: 0 });
          gsap.to(contentChildren, {
            y: '0em',
            opacity: 1,
            delay: 0.4,
            stagger: 0.15,
            duration: 0.4,
            ease: 'power1.Out',
          });
        } else {
          button.classList.remove('active');
          gsap.killTweensOf(timeline);
          gsap.set(timeline, { opacity: 0, width: '0%' });

          // Animate content children out
          gsap.to(contentChildren, {
            y: '1em',
            opacity: 0,
            stagger: 0,
            duration: 0.4,
            ease: 'power1.inOut',
          });
        }
      });

      isTransitioning = true;
      setTimeout(() => {
        isTransitioning = false;
      }, 500);
    }

    // Function to cycle through buttons automatically
    function startAutoCycle() {
      clearInterval(autoCycleInterval);
      autoCycleInterval = setInterval(() => {
        if (!isTransitioning) {
          activeIndex = (activeIndex + 1) % buttons.length;
          updateActiveButton();
        }
      }, 8000); // 8 seconds interval
    }

    // Add click event to each button
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => {
        if (!isTransitioning && activeIndex !== index) {
          activeIndex = index;
          updateActiveButton();
          startAutoCycle();
        }
      });
    });

    ScrollTrigger.create({
    trigger: ".pretty__slider",
    //markers: true,
    start: "top bottom",
    end: "top bottom",
    once: true,
    onEnter: () => {
      // Initialize
      updateActiveButton(); // Set up the initial active button
      startAutoCycle(); // Start the automatic cycling
    },
  });

    // Initialize
    // updateActiveButton(); // Set up the initial active button
    // startAutoCycle(); // Start the automatic cycling
  }


  //40
  function tooltip(container) {
    let cursorItem = container.querySelector(".cursor");
    let cursorParagraph = cursorItem.querySelector("p");
    let targets = container.closest("html").querySelectorAll("[data-cursor]");
    let xOffset = 30;
    let yOffset = 80;
    let cursorIsOnRight = false;
    let currentTarget = null;
    let lastText = "";
    // Position cursor relative to actual cursor position on page load
    gsap.set(cursorItem, { xPercent: xOffset, yPercent: yOffset });
    // Use GSAP quick.to for a more performative tween on the cursor
    let xTo = gsap.quickTo(cursorItem, "x", { ease: "power3" });
    let yTo = gsap.quickTo(cursorItem, "y", { ease: "power3" });
    // Function to scramble text
    const scrambleText = async (el, text) => {
      const DAMPING = 14;
      const DELAY = 2;
      function* shuffle(word) {
        let abc = "abcdefghijklmnopqrstuvwxyz";
        let w = [...word];
        let steps = (w.length + 1) * DAMPING;
        for (let step = 0; step < steps; step++) {
          for (let k = 0; k < w.length; k++) {
            if (step >= steps - w.length * DAMPING + k * DAMPING) {
              w[k] = word[k];
            } else {
              w[k] = abc[0 | (Math.random() * abc.length)];
            }
          }
          yield w.join("");
        }
      }
      async function delay(n) {
        return new Promise((r) => setTimeout(r, n));
      }
      for (let w of shuffle(text)) {
        el.textContent = w;
        await delay(DELAY);
      }
      el.textContent = text; // Finalize with the actual text
    };
    // On mousemove, call the quickTo functions to the actual cursor position
    window.addEventListener("mousemove", (e) => {
      let cursorItem = document.querySelector(".cursor");
      let cursorParagraph = cursorItem.querySelector("p");

      let windowWidth = window.innerWidth;
      let windowHeight = window.innerHeight;
      let scrollY = window.scrollY;
      let cursorX = e.clientX;
      let cursorY = e.clientY + scrollY; // Adjust cursorY to account for scroll
      // Default offsets
      let xPercent = xOffset;
      let yPercent = yOffset;
      // Adjust X offset if in the rightmost 19% of the window
      if (cursorX > windowWidth * 0.81) {
        cursorIsOnRight = true;
        xPercent = -100;
      } else {
        cursorIsOnRight = false;
      }
      // Adjust Y offset if in the bottom 10% of the current viewport
      if (cursorY > scrollY + windowHeight * 0.9) {
        yPercent = -120;
      }
      if (currentTarget) {
        let newText = currentTarget.getAttribute("data-cursor");
        if (currentTarget.hasAttribute("data-easteregg") && cursorIsOnRight) {
          newText = currentTarget.getAttribute("data-easteregg");
        }
        if (newText !== lastText) {
          scrambleText(cursorParagraph, newText); // Scramble the text
          lastText = newText;
        }
      }
      gsap.to(cursorItem, {
        xPercent: xPercent,
        yPercent: yPercent,
        duration: 1.9,
        ease: "power3",
      });
      xTo(cursorX);
      yTo(cursorY - scrollY); // Subtract scroll for viewport positioning

      const hasText =
            e.target.closest("[data-cursor]") ||
            e.target.hasAttribute("[data-cursor]");

      if (hasText) {
        const text = hasText.getAttribute("data-cursor");
        cursorParagraph.textContent = text;
        cursorItem.setAttribute("data-show", true);
      } else {
        cursorItem.setAttribute("data-show", false);
      }

    });

    targets.forEach((target) => {
      target.addEventListener("mouseenter", () => {
        currentTarget = target; // Set the current target
        let newText = target.hasAttribute("data-easteregg")
        ? target.getAttribute("data-easteregg")
        : target.getAttribute("data-cursor");
        if (newText !== lastText) {
          scrambleText(cursorParagraph, newText); // Scramble the text on hover
          lastText = newText;
        }
      });
    });

    // Add a mouse enter listener for each link that has a data-cursor attribute
  }
  /*
  function tooltip(container) {
    let cursorItem = container.querySelector(".cursor");
    let cursorParagraph = cursorItem.querySelector("p");
    let targets = container.closest("html").querySelectorAll("[data-cursor]");
    let xOffset = 30;
    let yOffset = 80;
    let cursorIsOnRight = false;
    let currentTarget = null;
    let lastText = "";

    // Position cursor relative to actual cursor position on page load
    gsap.set(cursorItem, { xPercent: xOffset, yPercent: yOffset });

    // Use GSAP quick.to for a more performative tween on the cursor
    let xTo = gsap.quickTo(cursorItem, "x", { ease: "power3" });
    let yTo = gsap.quickTo(cursorItem, "y", { ease: "power3" });

    // Function to scramble text
    const scrambleText = async (el, text) => {
      const DAMPING = 14;
      const DELAY = 2;

      function* shuffle(word) {
        let abc = "abcdefghijklmnopqrstuvwxyz";
        let w = [...word];
        let steps = (w.length + 1) * DAMPING;

        for (let step = 0; step < steps; step++) {
          for (let k = 0; k < w.length; k++) {
            if (step >= steps - w.length * DAMPING + k * DAMPING) {
              w[k] = word[k];
            } else {
              w[k] = abc[0 | (Math.random() * abc.length)];
            }
          }
          yield w.join("");
        }
      }

      async function delay(n) {
        return new Promise((r) => setTimeout(r, n));
      }

      for (let w of shuffle(text)) {
        el.textContent = w;
        await delay(DELAY);
      }
      el.textContent = text; // Finalize with the actual text
    };

    // On mousemove, call the quickTo functions to the actual cursor position
    window.addEventListener("mousemove", (e) => {
      let windowWidth = window.innerWidth;
      let windowHeight = window.innerHeight;
      let scrollY = window.scrollY;
      let cursorX = e.clientX;
      let cursorY = e.clientY + scrollY; // Adjust cursorY to account for scroll

      // Default offsets
      let xPercent = xOffset;
      let yPercent = yOffset;

      // Adjust X offset if in the rightmost 19% of the window
      if (cursorX > windowWidth * 0.81) {
        cursorIsOnRight = true;
        xPercent = -100;
      } else {
        cursorIsOnRight = false;
      }

      // Adjust Y offset if in the bottom 10% of the current viewport
      if (cursorY > scrollY + windowHeight * 0.9) {
        yPercent = -120;
      }

      if (currentTarget) {
        let newText = currentTarget.getAttribute("data-cursor");
        if (currentTarget.hasAttribute("data-easteregg") && cursorIsOnRight) {
          newText = currentTarget.getAttribute("data-easteregg");
        }

        if (newText !== lastText) {
          scrambleText(cursorParagraph, newText); // Scramble the text
          lastText = newText;
        }
      }

      gsap.to(cursorItem, {
        xPercent: xPercent,
        yPercent: yPercent,
        duration: 1.9,
        ease: "power3",
      });
      xTo(cursorX);
      yTo(cursorY - scrollY); // Subtract scroll for viewport positioning
    });

    // Add a mouse enter listener for each link that has a data-cursor attribute
    targets.forEach((target) => {
      target.addEventListener("mouseenter", () => {
        currentTarget = target; // Set the current target

        //   console.log("Enter...", currentTarget);

        let newText = target.hasAttribute("data-easteregg")
        ? target.getAttribute("data-easteregg")
        : target.getAttribute("data-cursor");

        if (newText !== lastText) {
          scrambleText(cursorParagraph, newText); // Scramble the text on hover
          lastText = newText;
        }
      });
    });
  }
  */

  //41
  function cardsStack(container) {
    if (!container) return;

    const wrapper = container.querySelector('.sticky__card-wrap');
    if (!wrapper) return;

    const cards = wrapper.querySelectorAll('.sticky-card');
    if (cards.length === 0) return;

    const initializeAnimations = () => {
      cards.forEach((card, index) => {
        const prevCard = cards[index - 1];
        const prevPrevCard = cards[index - 2];

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: card,
            start: 'top 70%',
            end: 'top 30%',
            scrub: 2,
          }
        });

        // Animate the previous card (index - 1)
        if (prevCard) {
          tl.fromTo(prevCard, {}, {
            y: '-1em',
            scale: 0.9,
            ease: 'power1.inOut',
          }, 0);

          const prevCardOverlay = prevCard.querySelector('.sticky-card-overlay');
          if (prevCardOverlay) {
            tl.fromTo(prevCardOverlay, {}, {
              opacity: 0.6,
              ease: 'power1.inOut',
            }, 0);
          }          
        }

        // Animate the card before the previous card (index - 2)
        if (prevPrevCard) {
          tl.fromTo(prevPrevCard, {}, {
            y: '-2em',
            scale: 0.8,
            ease: 'power1.inOut',
          }, 0);

          const prevPrevCardOverlay = prevPrevCard.querySelector('.sticky-card-overlay');
          if (prevPrevCardOverlay) {
            tl.fromTo(prevPrevCardOverlay, {}, {
              opacity: 1,
              ease: 'power1.inOut',
            }, 0);
          }          
        }
      });      
    };

    const isDesktop = window.matchMedia('(min-width: 1024px)');

    if (isDesktop.matches) {
      initializeAnimations();
    }

    isDesktop.addEventListener('change', (e) => {
      if (e.matches) {
        initializeAnimations();
      } else {
        ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      }
    });
  }


  //42
  function initCalendly(container) {
    const form = document.querySelector("[data-form='calendly']");

    if (!form) return;

    form.insertAdjacentHTML(
      "beforeend",
      `
    <div 
        class="calendly-inline-widget" 
        data-url="https://calendly.com/boris-raichman/effortel-demo?background_color=A1B5BF&text_color=000000&primary_color=000000" 
        style="width:100%;height:50vh;max-height:50vh;"
    ></div>
  `);

    const script = document.createElement("script");
    script.src = "https://assets.calendly.com/assets/external/widget.js";

    document.body.append(script);
  }



  //43
  function initGlobe(container) {
    const globe = container.querySelector(".globe");

    if (!globe) return;

    window.effortelContactGlobe.page = container;
    window.effortelContactGlobe.init();
  }

  // 45
  function dragable(container) {
    if (window.innerWidth < 1024) return; // Only run on desktop (adjust breakpoint if needed)

    gsap.registerPlugin(Draggable, ScrollTrigger);

    gsap.to(".flex-inner", {
      width: "100%",
      ease: "none",
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: true
      }
    });

    gsap.to(".progress-thumb", {
      x: window.innerWidth * 0.98, 
      ease: "none",
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: true
      }
    });

    ScrollTrigger.create({
      trigger: "body",
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        let progressNum = Math.floor(self.progress * 99) + 1; 
        document.querySelector(".draggable__progress").textContent = progressNum.toString().padStart(2, "0");
      }
    });

    Draggable.create(".progress-thumb", {
      type: "x",
      bounds: { minX: 0, maxX: window.innerWidth * 0.99 }, 
      inertia: true,
      onDrag: function () {
        let progress = this.x / (window.innerWidth * 0.99); 
        let scrollY = progress * (document.body.scrollHeight - window.innerHeight);
        window.scrollTo({ top: scrollY, behavior: "auto" });

        let progressNum = Math.floor(progress * 99) + 1;
        document.querySelector(".draggable__progress").textContent = progressNum.toString().padStart(2, "0");
      }
    });
  }


  function preventer(container) {
    setTimeout(() => {
      let honeypotField = document.querySelector(".company_info");
      let submitButton = document.querySelector("form button[type='submit']");

      if (honeypotField && submitButton) {
        honeypotField.addEventListener("input", function () {
          if (honeypotField.value.trim() !== "") {
            submitButton.disabled = true;
            submitButton.style.opacity = "0.5"; // Visual feedback
          } else {
            submitButton.disabled = false;
            submitButton.style.opacity = "1";
          }
        });
      }
    }, 2000); // Delay to ensure HubSpot form is loaded
  }

